-- Lectura del registro de migraciones para el chequeo de salud (/api/health/ready).
GRANT USAGE ON SCHEMA drizzle TO app_user;
--> statement-breakpoint
GRANT SELECT ON drizzle.__drizzle_migrations TO app_user;
--> statement-breakpoint

-- Tarea diaria (alertas de presupuesto y vencimientos): por cada empresa activa devuelve un
-- propietario activo, en cuyo nombre se evalúan las alertas con su contexto RLS normal.
-- Solo identificadores: ningún dato financiero.
CREATE OR REPLACE FUNCTION app.cron_targets()
RETURNS TABLE (organization_id uuid, slug text, owner_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT DISTINCT ON (o.id) o.id, o.slug, m.user_id
  FROM public.organizations o
  JOIN public.memberships m ON m.organization_id = o.id AND m.status = 'active'
  JOIN public.roles r ON r.id = m.role_id AND r.key = 'owner'
  WHERE o.status = 'active'
  ORDER BY o.id, m.created_at
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.cron_targets() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.cron_targets() TO app_user;
