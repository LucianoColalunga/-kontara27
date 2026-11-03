# ADR 0004 — Modelo de movimientos, tipos y dinero

- Estado: aceptado
- Fecha: 2026-11-03

## Contexto

Las planillas con que muchas pequeñas empresas llevan sus cuentas registran cada operación en una sola fila (fecha, categoría, descripción, gasto o
ingreso). El producto necesita además devoluciones, ajustes, transferencias internas, inversiones y tipos
configurables, sin que una transferencia cuente como ingreso o gasto.

En esas planillas es habitual que una misma categoría se use para ingresos y gastos y que haya devoluciones
cargadas como ingresos.

## Decisión

Registro de **partida simple con semántica explícita** (no doble partida completa, que no aporta valor a
los usuarios objetivo y complica la carga):

- Cada movimiento tiene un **tipo** que pertenece a una **naturaleza base** fija con efectos definidos:

| Naturaleza | Saldo de la cuenta | Estado de resultados | Flujo de caja |
|---|---|---|---|
| `income` ingreso | + | Ingreso | Operativo |
| `expense` gasto | − | Gasto | Operativo |
| `refund_in` devolución recibida | + | Resta gasto | Operativo |
| `refund_out` devolución emitida | − | Resta ingreso | Operativo |
| `adjustment_in` / `adjustment_out` ajuste | ± | No | Ajuste (se informa aparte) |
| `transfer` transferencia interna | − origen / + destino | No | No |
| `investment` inversión | − | No (se capitaliza) | Inversión |
| `contribution` aporte de socios | + | No | Financiación |
| `withdrawal` retiro de socios | − | No | Financiación |

- Cada organización puede crear **tipos personalizados** que heredan una naturaleza base (por ejemplo,
  «Seña de cliente» → `income`). Los reportes agregan por naturaleza, así nunca dependen de nombres.
- **Categorías** con alcance `income`, `expense` o `both`, editables, archivables y con orden. Se pueden
  eliminar solo si no tienen movimientos; si los tienen, se archivan o se reasignan.
- **Importe siempre positivo** en unidades menores (`bigint`); el signo lo da la naturaleza. Moneda
  ISO 4217 por movimiento y por cuenta (el movimiento debe estar en la moneda de su cuenta). No hay
  conversión automática: los reportes se muestran por moneda, sin inventar cotizaciones.
- **Cuenta** opcional (los movimientos históricos importados pueden no tenerla). Las transferencias
  exigen cuenta de origen y de destino distintas y de la misma moneda.
- **Estado**: `completed`, `pending` o `cancelled`; solo `completed` impacta en reportes y saldos.
  Conciliación como marca aparte (`reconciled_at`, `reconciled_by`).
- **Borrado controlado**: borrado lógico con motivo, restaurable; nunca físico desde la interfaz.
- **Historial**: un trigger de PostgreSQL guarda cada versión anterior del movimiento en
  `movement_revisions` con el usuario que hizo el cambio. Al estar en la base, ningún camino de la
  aplicación puede saltearlo.

## Consecuencias

- Las transferencias no alteran ingresos ni gastos por construcción.
- Las devoluciones cargadas como ingresos en una planilla pueden reclasificarse a `refund_in` sin perder el registro original
  (queda en el historial).
- Pasar a doble partida en el futuro es posible: cada naturaleza mapea a un asiento estándar.
