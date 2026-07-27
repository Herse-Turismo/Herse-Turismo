-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN: Seguridad de puntos + campo país
-- Pegar en Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════

-- 1. Campo país en viajes (para contador de países correcto)
ALTER TABLE viajes ADD COLUMN IF NOT EXISTS pais text;

-- 2. Trigger: al insertar una reseña, acredita +10.000 pts automáticamente (server-side)
CREATE OR REPLACE FUNCTION fn_puntos_por_resena()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO fidelizacion_trans (cliente_id, concepto, puntos, tipo, created_at)
  VALUES (NEW.cliente_id, 'Reseña aprobada', 10000, 'bonus', now());

  INSERT INTO fidelizacion (cliente_id, puntos, puntos_disponibles, puntos_historicos, updated_at)
  VALUES (NEW.cliente_id, 10000, 10000, 10000, now())
  ON CONFLICT (cliente_id) DO UPDATE SET
    puntos = COALESCE(fidelizacion.puntos, 0) + 10000,
    puntos_disponibles = COALESCE(fidelizacion.puntos_disponibles, 0) + 10000,
    puntos_historicos = COALESCE(fidelizacion.puntos_historicos, 0) + 10000,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_puntos_por_resena ON viaje_ratings;
CREATE TRIGGER trg_puntos_por_resena
  AFTER INSERT ON viaje_ratings
  FOR EACH ROW EXECUTE FUNCTION fn_puntos_por_resena();

-- 3. RPC: canje de beneficios atómico y validado server-side
CREATE OR REPLACE FUNCTION canjear_beneficio(p_concepto text, p_costo integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_disp integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'No autenticado');
  END IF;
  IF p_costo IS NULL OR p_costo <= 0 THEN
    RETURN json_build_object('ok', false, 'error', 'Costo inválido');
  END IF;

  SELECT COALESCE(puntos_disponibles, puntos, 0) INTO v_disp
  FROM fidelizacion WHERE cliente_id = v_uid FOR UPDATE;

  IF v_disp IS NULL OR v_disp < p_costo THEN
    RETURN json_build_object('ok', false, 'error', 'Puntos insuficientes');
  END IF;

  INSERT INTO fidelizacion_trans (cliente_id, concepto, puntos, tipo, created_at)
  VALUES (v_uid, 'Canje: ' || p_concepto, -p_costo, 'canje', now());

  UPDATE fidelizacion SET
    puntos = v_disp - p_costo,
    puntos_disponibles = v_disp - p_costo,
    updated_at = now()
  WHERE cliente_id = v_uid;

  RETURN json_build_object('ok', true, 'disponibles', v_disp - p_costo);
END;
$$;

-- 4. Permitir al admin (usuarios autenticados) leer todas las reseñas
DROP POLICY IF EXISTS "authenticated leen resenas" ON viaje_ratings;
CREATE POLICY "authenticated leen resenas"
  ON viaje_ratings FOR SELECT
  TO authenticated
  USING (true);
