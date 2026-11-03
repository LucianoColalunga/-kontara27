-- Disponibilidad global de slugs de organización. RLS oculta las empresas ajenas, así que la
-- aplicación no puede comprobar colisiones con un SELECT; esta función solo responde verdadero/falso.
CREATE OR REPLACE FUNCTION app.slug_available(p_slug text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$ SELECT NOT EXISTS (SELECT 1 FROM public.organizations WHERE slug = p_slug) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.slug_available(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.slug_available(text) TO app_user;
