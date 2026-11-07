# invoice-to-sheet

> Una carpeta de facturas en PDF entra, una hoja de cálculo limpia sale. Extraído por Claude, verificado por código.

[English](./README.md) · Licencia MIT

## El problema

Cualquier negocio pequeño tiene la misma tarea cada semana: una pila de facturas de proveedores que alguien abre una por una y copia a mano a Excel o al sistema contable. Cincuenta facturas a tres o cuatro minutos cada una son unas **tres horas de pura digitación**, y los errores solo aparecen cuando los números no cuadran.

`invoice-to-sheet` lo convierte en un solo comando: lee cada PDF, le pide a Claude los campos en JSON, comprueba que la aritmética cuadre y escribe un CSV que abre directo en Google Sheets o Excel. Lo que parezca raro se marca para revisión humana en vez de colarse en la contabilidad.

## Inicio rápido

Requiere Node.js 20 o superior.

```bash
npm install
npm run demo        # procesa samples/ en modo mock (sin API key)
```

Abra `output/invoices.csv` en Google Sheets o Excel. Los renglones de cada factura están en `output/line_items.csv` y el registro completo en `output/invoices.json`.

Para usar Claude con sus propias facturas:

```bash
cp .env.example .env          # pegue su ANTHROPIC_API_KEY
npm run build
node dist/cli.js ./mis-facturas --out ./output
```

Si no hay API key el programa cae automáticamente en modo mock y lo indica en pantalla.

## Cómo se controla la precisión

1. **Validación con zod**: fechas ISO, código de moneda de 3 letras, montos no negativos. Si la respuesta de Claude no valida, se le devuelve el error una vez; si vuelve a fallar, el archivo se reporta como fallido en lugar de adivinar.
2. **Campo `confidence`**: el extractor reporta su propia confianza (0 a 1). Menos de 0.7 se marca.
3. **Conciliación aritmética**: `subtotal + impuesto = total`, los renglones suman el subtotal (o el total, en facturas con IVA incluido como las de Guatemala), y `cantidad × precio = importe`, con tolerancia de centavos.
4. **Bandera `needs_review`** con las razones en el CSV, para que contabilidad filtre una sola columna.

## Costo aproximado

Una factura de una página son menos de 2,000 tokens en total. Con Claude Sonnet 4.5 el costo por 100 facturas queda **muy por debajo de un dólar** (aprox. USD 0.30–0.60 al momento de escribir esto; verifique el precio vigente). Esas mismas 100 facturas son cinco o seis horas de trabajo manual.

## Ideas para extender

Envío directo a Google Sheets por API, ingesta desde correo (Gmail / IMAP), nodo para n8n / Zapier / Make, OCR o visión para facturas escaneadas, sincronización con QuickBooks / Xero / ERP local.

## Contacto

Construyo automatizaciones pequeñas y confiables como esta para equipos saturados de trabajo documental repetitivo. Node.js/TypeScript o Python, integrado con las herramientas que ya usa (Google Workspace, n8n, Zapier, su ERP). Ciudad de Guatemala, español e inglés.

**[su-enlace-aquí](https://example.com)** <!-- TODO: LinkedIn / Upwork / Calendly -->

---

MIT © Sergio Ortiz
