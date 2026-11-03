-- Una persona puede quitar su propia membresía (abandonar una empresa o eliminar su cuenta).
-- La aplicación impide que el último propietario se vaya de una empresa con otros miembros.
CREATE POLICY memberships_delete_self ON public.memberships FOR DELETE TO app_user
  USING (user_id = app.current_user_id());
