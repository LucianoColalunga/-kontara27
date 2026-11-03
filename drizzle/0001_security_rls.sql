-- =====================================================================================
-- Seguridad de datos: aislamiento multiempresa con Row Level Security, permisos mínimos,
-- historial de movimientos e inmutabilidad del registro de auditoría. Ver ADR 0002.
--
-- Roles (creados fuera de las migraciones, ver scripts/db/bootstrap.ts y docs/deployment.md):
--   app_owner  dueño de las tablas; ejecuta estas migraciones.
--   app_user   rol de la aplicación: NOSUPERUSER, NOBYPASSRLS, no dueño de nada.
-- =====================================================================================

CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
REVOKE ALL ON SCHEMA app FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO app_user;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_user;
--> statement-breakpoint

-- -------------------------------------------------------------------------------------
-- Contexto de la transacción. La aplicación lo fija con set_config(..., true) (local a la
-- transacción) dentro de withTenant(). Sin contexto, las funciones devuelven NULL y las
-- políticas no dejan ver ninguna fila (falla cerrada).
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint

-- Devuelve la organización del contexto solo si el usuario tiene una membresía activa en ella
-- y la organización no está suspendida. SECURITY DEFINER: lee memberships/organizations sin RLS
-- (esas dos tablas no usan FORCE para que el dueño de la función no entre en recursión).
CREATE OR REPLACE FUNCTION app.current_org_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT m.organization_id
  FROM public.memberships m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.organization_id = nullif(current_setting('app.org_id', true), '')::uuid
    AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    AND m.status = 'active'
    AND o.status = 'active'
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.is_member(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.organization_id = p_org
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      AND m.status = 'active'
  )
$$;
--> statement-breakpoint

-- Alta de una organización: quien la creó puede insertar sus roles y su propia membresía
-- mientras la organización todavía no tiene miembros. Después rigen las políticas normales.
CREATE OR REPLACE FUNCTION app.can_bootstrap(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.organizations o
           WHERE o.id = p_org AND o.created_by = nullif(current_setting('app.user_id', true), '')::uuid
         )
     AND NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id = p_org)
$$;
--> statement-breakpoint

-- Aceptar una invitación: el invitado todavía no es miembro, así que no puede leer la
-- invitación por RLS. La función valida token, vencimiento y que el correo verificado coincida.
CREATE OR REPLACE FUNCTION app.accept_invitation(p_token_hash text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  v_email text;
  v_inv public.invitations%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'invitation_no_user' USING ERRCODE = 'P0001';
  END IF;
  SELECT email_normalized INTO v_email FROM public.users
  WHERE id = v_user AND email_verified_at IS NOT NULL AND deleted_at IS NULL;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'invitation_user_not_verified' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_inv FROM public.invitations WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR v_inv.accepted_at IS NOT NULL OR v_inv.revoked_at IS NOT NULL OR v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'invitation_invalid' USING ERRCODE = 'P0001';
  END IF;
  IF v_inv.email_normalized <> v_email THEN
    RAISE EXCEPTION 'invitation_email_mismatch' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.memberships (id, organization_id, user_id, role_id, status, invited_by)
  VALUES (gen_random_uuid(), v_inv.organization_id, v_user, v_inv.role_id, 'active', v_inv.invited_by)
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET role_id = EXCLUDED.role_id, status = 'active', updated_at = now();
  UPDATE public.invitations SET accepted_at = now() WHERE id = v_inv.id;
  RETURN v_inv.organization_id;
END;
$$;
--> statement-breakpoint

-- Invitaciones pendientes para el correo verificado del usuario actual (para mostrarlas al iniciar sesión).
CREATE OR REPLACE FUNCTION app.pending_invitations()
RETURNS TABLE (invitation_id uuid, organization_name text, role_name text, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT i.id, o.name, r.name, i.expires_at
  FROM public.invitations i
  JOIN public.organizations o ON o.id = i.organization_id AND o.status = 'active'
  JOIN public.roles r ON r.id = i.role_id
  JOIN public.users u ON u.id = nullif(current_setting('app.user_id', true), '')::uuid
  WHERE i.email_normalized = u.email_normalized
    AND u.email_verified_at IS NOT NULL
    AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
$$;
--> statement-breakpoint

-- Superadministración de plataforma: solo para usuarios en platform_admins.
CREATE OR REPLACE FUNCTION app.is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins a
    WHERE a.user_id = nullif(current_setting('app.user_id', true), '')::uuid
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.admin_list_organizations()
RETURNS TABLE (id uuid, slug text, name text, country text, plan text, status text, members bigint, movements bigint, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT app.is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- Solo metadatos y conteos: ningún dato financiero de las empresas.
  RETURN QUERY
  SELECT o.id, o.slug, o.name, o.country, o.plan, o.status,
         (SELECT count(*) FROM public.memberships m WHERE m.organization_id = o.id),
         (SELECT count(*) FROM public.movements mv WHERE mv.organization_id = o.id AND mv.deleted_at IS NULL),
         o.created_at
  FROM public.organizations o
  ORDER BY o.created_at DESC;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.admin_set_organization_status(p_org uuid, p_status text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT app.is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.organizations SET status = p_status, updated_at = now() WHERE id = p_org;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO app_user;
--> statement-breakpoint

-- -------------------------------------------------------------------------------------
-- Privilegios mínimos del rol de la aplicación
-- -------------------------------------------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
--> statement-breakpoint
-- Movimientos: solo borrado lógico.
REVOKE DELETE ON public.movements FROM app_user;
--> statement-breakpoint
-- Historial: lo escribe únicamente el trigger (como dueño). La aplicación solo lo lee.
REVOKE INSERT, UPDATE, DELETE ON public.movement_revisions FROM app_user;
--> statement-breakpoint
-- Auditoría: append-only.
REVOKE UPDATE, DELETE ON public.audit_events FROM app_user;
--> statement-breakpoint
-- Las organizaciones no se borran desde la aplicación.
REVOKE DELETE ON public.organizations FROM app_user;
--> statement-breakpoint

-- -------------------------------------------------------------------------------------
-- Row Level Security
-- -------------------------------------------------------------------------------------

-- organizations / memberships: ENABLE sin FORCE (las leen las funciones SECURITY DEFINER).
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY organizations_select ON public.organizations FOR SELECT TO app_user
  USING (app.is_member(id));
--> statement-breakpoint
CREATE POLICY organizations_insert ON public.organizations FOR INSERT TO app_user
  WITH CHECK (created_by = app.current_user_id() AND status = 'active');
--> statement-breakpoint
CREATE POLICY organizations_update ON public.organizations FOR UPDATE TO app_user
  USING (id = (SELECT app.current_org_id()))
  WITH CHECK (id = (SELECT app.current_org_id()));
--> statement-breakpoint

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY memberships_select ON public.memberships FOR SELECT TO app_user
  USING (user_id = app.current_user_id() OR organization_id = (SELECT app.current_org_id()));
--> statement-breakpoint
CREATE POLICY memberships_insert ON public.memberships FOR INSERT TO app_user
  WITH CHECK (
    organization_id = (SELECT app.current_org_id())
    OR (app.can_bootstrap(organization_id) AND user_id = app.current_user_id())
  );
--> statement-breakpoint
CREATE POLICY memberships_update ON public.memberships FOR UPDATE TO app_user
  USING (organization_id = (SELECT app.current_org_id()))
  WITH CHECK (organization_id = (SELECT app.current_org_id()));
--> statement-breakpoint
CREATE POLICY memberships_delete ON public.memberships FOR DELETE TO app_user
  USING (organization_id = (SELECT app.current_org_id()));
--> statement-breakpoint

-- invitations: ENABLE sin FORCE (la lee app.accept_invitation).
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invitations_tenant ON public.invitations FOR ALL TO app_user
  USING (organization_id = (SELECT app.current_org_id()))
  WITH CHECK (organization_id = (SELECT app.current_org_id()));
--> statement-breakpoint

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.roles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY roles_select ON public.roles FOR SELECT TO app_user
  USING (app.is_member(organization_id));
--> statement-breakpoint
CREATE POLICY roles_insert ON public.roles FOR INSERT TO app_user
  WITH CHECK (organization_id = (SELECT app.current_org_id()) OR app.can_bootstrap(organization_id));
--> statement-breakpoint
CREATE POLICY roles_update ON public.roles FOR UPDATE TO app_user
  USING (organization_id = (SELECT app.current_org_id()))
  WITH CHECK (organization_id = (SELECT app.current_org_id()));
--> statement-breakpoint
CREATE POLICY roles_delete ON public.roles FOR DELETE TO app_user
  USING (organization_id = (SELECT app.current_org_id()));
--> statement-breakpoint

-- Tablas de negocio: una política única por organización, ENABLE + FORCE.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounts', 'categories', 'sectors', 'payment_methods', 'movement_types', 'movements',
    'budgets', 'budget_alerts', 'reminders', 'files', 'movement_attachments',
    'import_batches', 'import_rows'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO app_user
         USING (organization_id = (SELECT app.current_org_id()))
         WITH CHECK (organization_id = (SELECT app.current_org_id()))',
      t || '_tenant', t
    );
  END LOOP;
END;
$$;
--> statement-breakpoint

ALTER TABLE public.movement_revisions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.movement_revisions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY movement_revisions_select ON public.movement_revisions FOR SELECT TO app_user
  USING (organization_id = (SELECT app.current_org_id()));
--> statement-breakpoint
-- El trigger corre como app_owner; con FORCE también necesita una política de inserción.
CREATE POLICY movement_revisions_insert_owner ON public.movement_revisions FOR INSERT TO app_owner
  WITH CHECK (organization_id = (SELECT app.current_org_id()));
--> statement-breakpoint
CREATE POLICY movement_revisions_select_owner ON public.movement_revisions FOR SELECT TO app_owner
  USING (organization_id = (SELECT app.current_org_id()));
--> statement-breakpoint

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO app_user
  USING (organization_id = (SELECT app.current_org_id()) AND user_id = app.current_user_id());
--> statement-breakpoint
CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO app_user
  WITH CHECK (organization_id = (SELECT app.current_org_id()));
--> statement-breakpoint
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO app_user
  USING (organization_id = (SELECT app.current_org_id()) AND user_id = app.current_user_id())
  WITH CHECK (organization_id = (SELECT app.current_org_id()) AND user_id = app.current_user_id());
--> statement-breakpoint
CREATE POLICY notifications_delete ON public.notifications FOR DELETE TO app_user
  USING (organization_id = (SELECT app.current_org_id()) AND user_id = app.current_user_id());
--> statement-breakpoint

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_events_select ON public.audit_events FOR SELECT TO app_user
  USING (
    organization_id = (SELECT app.current_org_id())
    OR (organization_id IS NULL AND actor_user_id = app.current_user_id())
  );
--> statement-breakpoint
CREATE POLICY audit_events_insert ON public.audit_events FOR INSERT TO app_user
  WITH CHECK (organization_id IS NULL OR organization_id = (SELECT app.current_org_id()));
--> statement-breakpoint

-- -------------------------------------------------------------------------------------
-- Movimientos: columnas inmutables, versión y historial automáticos
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.movements_before_update() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id
     OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'movement_immutable_columns' USING ERRCODE = 'P0001';
  END IF;
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  NEW.updated_by := coalesce(nullif(current_setting('app.user_id', true), '')::uuid, NEW.updated_by);
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.movements_record_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.movement_revisions (id, organization_id, movement_id, revision, operation, changed_by, snapshot)
  VALUES (
    gen_random_uuid(), OLD.organization_id, OLD.id, OLD.version,
    CASE
      WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN 'delete'
      WHEN NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN 'restore'
      ELSE 'update'
    END,
    nullif(current_setting('app.user_id', true), '')::uuid,
    -- El importe va como texto: jsonb numérico perdería precisión al leerse en JavaScript.
    to_jsonb(OLD) || jsonb_build_object('amount_minor', OLD.amount_minor::text)
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER movements_before_update BEFORE UPDATE ON public.movements
  FOR EACH ROW EXECUTE FUNCTION app.movements_before_update();
--> statement-breakpoint
CREATE TRIGGER movements_after_update AFTER UPDATE ON public.movements
  FOR EACH ROW EXECUTE FUNCTION app.movements_record_revision();
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.movements_before_update() FROM PUBLIC, app_user;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.movements_record_revision() FROM PUBLIC, app_user;
