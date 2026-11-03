# Marca KONTARA 27

Manual completo e interactivo, con todas las piezas descargables: `/marca` dentro de la aplicación
(`src/app/marca/page.tsx`). Este documento resume las reglas para quien trabaja fuera de la app.

## Nombre

**KONTARA 27.** «Kontara» viene de *contar*: llevar la cuenta y narrar lo que pasa en una empresa. El **27**
es 3³: un cubo de tres unidades por lado.

- El número es parte del nombre: nunca «Kontara» solo ni el 27 separado.
- Logotipo: «KONTARA 27» en mayúsculas, el 27 en cobalto (o del color del texto en versiones monocromas).
- Texto corrido (títulos, asuntos de correo, nombre de la app instalada): «Kontara 27».

## Isotipo: el Cubo 27

Un cubo isométrico de 3 × 3 × 3 con la unidad central resaltada en cobalto: *cada unidad cuenta*. Transmite
solidez, estructura y precisión.

- Espacio de resguardo: como mínimo la altura de la unidad central (un tercio de la arista).
- Tamaño mínimo: isotipo 16 px; logotipo horizontal 120 px de ancho en pantalla o 30 mm impreso.
- No rotar ni deformar; el cobalto va solo en la unidad central; sobre fotos, usar la versión negativa o
  monocroma.

## Color

| Nombre | Hex | Uso |
| --- | --- | --- |
| Tinta | `#0B1A2E` | Estructura, texto principal |
| Cobalto | `#1D5BFF` | Acción principal, el «27», la unidad central |
| Cobalto claro | `#5B8CFF` | Acento sobre fondos oscuros |
| Niebla | `#F5F6F8` | Fondo de la aplicación en modo claro |
| Pizarra | `#627089` | Texto secundario, ejes de gráficos |
| Noche | `#08101C` | Fondo de la aplicación en modo oscuro |

Datos y estados (claro / oscuro): ingresos `#2A78D6` / `#3987E5`, gastos `#EB6834` / `#D95926`, correcto
`#0B7A47` / `#3CCB80`, advertencia `#9A5A00` / `#F2B84B`, crítico `#C42B2B` / `#FF7A7A`. Los estados se
muestran siempre con ícono y texto, nunca solo con color. Todos los pares de texto cumplen WCAG AA.

## Tipografía e íconos

- **Sora**: logotipo (600, espaciado amplio) y títulos.
- **Manrope**: interfaz, formularios, tablas y gráficos; cifras tabulares en columnas de importes.
- Íconos **Lucide**, trazo 2 px, 16–20 px, siempre con texto o etiqueta accesible.

## Archivos

En `public/brand/` (SVG) y `public/icons/` (favicon, íconos de la PWA, iPhone y adaptable). Se generan desde
`src/config/brand.ts`, el único lugar donde vive el nombre:

```bash
npm run brand:build
```
