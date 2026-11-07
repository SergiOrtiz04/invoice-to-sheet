#!/usr/bin/env python3
"""
Generates the three sample invoices in ../samples/ with ReportLab.

Each invoice uses a different layout, vendor, language and currency so the
extractor is exercised on more than one template:

  1. acme-cloud-usd.pdf      - US SaaS vendor, USD, classic two-column header
  2. tecnosol-gtq.pdf        - Guatemalan vendor, GTQ, Spanish labels, IVA 12 %
  3. nordlicht-eur.pdf       - German vendor, EUR, European number format (1.234,56)

Run:  python3 scripts/generate-samples.py
The PDFs are committed to the repo, so you only need this if you change them.
"""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

OUT = Path(__file__).resolve().parent.parent / "samples"
OUT.mkdir(exist_ok=True)


def money_us(n: float) -> str:
    return f"{n:,.2f}"


def money_eu(n: float) -> str:
    # 1234.5 -> "1.234,50"
    s = f"{n:,.2f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


# --------------------------------------------------------------------------
# 1. ACME Cloud Services (USD)
# --------------------------------------------------------------------------
def acme_cloud() -> None:
    c = canvas.Canvas(str(OUT / "acme-cloud-usd.pdf"), pagesize=letter)
    w, h = letter

    c.setFillColor(colors.HexColor("#1f4e79"))
    c.rect(0, h - 30 * mm, w, 30 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(20 * mm, h - 18 * mm, "ACME Cloud Services, Inc.")
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, h - 25 * mm, "548 Market St, San Francisco, CA 94104, USA  |  billing@acmecloud.example")

    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 16)
    c.drawRightString(w - 20 * mm, h - 45 * mm, "INVOICE")

    c.setFont("Helvetica", 10)
    y = h - 55 * mm
    for label, value in [
        ("Invoice Number:", "INV-2025-00417"),
        ("Invoice Date:", "2025-09-03"),
        ("Due Date:", "2025-10-03"),
        ("Currency:", "USD"),
        ("Payment Terms:", "Net 30"),
    ]:
        c.drawRightString(w - 60 * mm, y, label)
        c.drawString(w - 57 * mm, y, value)
        y -= 5.5 * mm

    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, h - 55 * mm, "Bill To:")
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, h - 61 * mm, "Ortiz Automation Studio")
    c.drawString(20 * mm, h - 66 * mm, "Zona 10, Guatemala City")
    c.drawString(20 * mm, h - 71 * mm, "Guatemala")

    # Table
    items = [
        ("Compute instances (m5.large) - 720 h", 3, 58.40),
        ("Object storage - 2 TB", 1, 46.00),
        ("Managed PostgreSQL (db.t3.medium)", 1, 112.50),
        ("Support plan - Developer", 1, 29.00),
    ]
    top = h - 90 * mm
    c.setFillColor(colors.HexColor("#e8eef5"))
    c.rect(20 * mm, top - 2 * mm, w - 40 * mm, 8 * mm, fill=1, stroke=0)
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(22 * mm, top, "Description")
    c.drawRightString(125 * mm, top, "Qty")
    c.drawRightString(155 * mm, top, "Unit Price")
    c.drawRightString(w - 22 * mm, top, "Amount")

    c.setFont("Helvetica", 10)
    y = top - 9 * mm
    subtotal = 0.0
    for desc, qty, unit in items:
        amount = round(qty * unit, 2)
        subtotal += amount
        c.drawString(22 * mm, y, desc)
        c.drawRightString(125 * mm, y, str(qty))
        c.drawRightString(155 * mm, y, money_us(unit))
        c.drawRightString(w - 22 * mm, y, money_us(amount))
        y -= 6.5 * mm

    tax = round(subtotal * 0.0875, 2)
    total = round(subtotal + tax, 2)
    y -= 4 * mm
    c.line(110 * mm, y + 3 * mm, w - 20 * mm, y + 3 * mm)
    for label, value, bold in [
        ("Subtotal:", f"$ {money_us(subtotal)}", False),
        ("Sales Tax (8.75%):", f"$ {money_us(tax)}", False),
        ("Total Due:", f"$ {money_us(total)}", True),
    ]:
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 11 if bold else 10)
        c.drawRightString(155 * mm, y, label)
        c.drawRightString(w - 22 * mm, y, value)
        y -= 6.5 * mm

    c.setFont("Helvetica-Oblique", 8)
    c.setFillColor(colors.grey)
    c.drawString(20 * mm, 20 * mm, "Thank you for your business. Please reference the invoice number on your payment.")
    c.save()
    print(f"wrote acme-cloud-usd.pdf  subtotal={subtotal:.2f} tax={tax:.2f} total={total:.2f}")


# --------------------------------------------------------------------------
# 2. TecnoSol Guatemala (GTQ, Spanish)
# --------------------------------------------------------------------------
def tecnosol() -> None:
    c = canvas.Canvas(str(OUT / "tecnosol-gtq.pdf"), pagesize=letter)
    w, h = letter

    c.setFont("Helvetica-Bold", 18)
    c.setFillColor(colors.HexColor("#c0392b"))
    c.drawString(20 * mm, h - 25 * mm, "TecnoSol Guatemala, S.A.")
    c.setFillColor(colors.black)
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, h - 31 * mm, "NIT: 8765432-1   |   12 Calle 1-25 Zona 10, Edificio Geminis, Guatemala")
    c.drawString(20 * mm, h - 36 * mm, "Tel: +502 2300-1234   |   facturacion@tecnosol.example")

    c.setStrokeColor(colors.HexColor("#c0392b"))
    c.setLineWidth(1.2)
    c.line(20 * mm, h - 40 * mm, w - 20 * mm, h - 40 * mm)

    c.setFont("Helvetica-Bold", 14)
    c.drawString(20 * mm, h - 50 * mm, "FACTURA ELECTRONICA")
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, h - 58 * mm, "Serie: A        No. Factura: 2025-1188")
    c.drawString(20 * mm, h - 64 * mm, "Fecha de emision: 15/09/2025")
    c.drawString(20 * mm, h - 70 * mm, "Fecha de vencimiento: 30/09/2025")
    c.drawString(20 * mm, h - 76 * mm, "Moneda: Quetzales (GTQ)")

    c.setFont("Helvetica-Bold", 10)
    c.drawString(110 * mm, h - 58 * mm, "Cliente:")
    c.setFont("Helvetica", 10)
    c.drawString(110 * mm, h - 64 * mm, "Sergio Ortiz")
    c.drawString(110 * mm, h - 70 * mm, "NIT: CF")
    c.drawString(110 * mm, h - 76 * mm, "Ciudad de Guatemala")

    items = [
        ("Laptop Lenovo ThinkPad E14 Gen 5", 1, 7850.00),
        ("Monitor 27\" IPS 1440p", 2, 1890.00),
        ("Hub USB-C 7 en 1", 1, 345.00),
    ]
    top = h - 92 * mm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, top, "Cant.")
    c.drawString(38 * mm, top, "Descripcion")
    c.drawRightString(150 * mm, top, "Precio Unit.")
    c.drawRightString(w - 20 * mm, top, "Total")
    c.setStrokeColor(colors.black)
    c.setLineWidth(0.5)
    c.line(20 * mm, top - 2 * mm, w - 20 * mm, top - 2 * mm)

    c.setFont("Helvetica", 10)
    y = top - 8 * mm
    total = 0.0
    for desc, qty, unit in items:
        amount = round(qty * unit, 2)
        total += amount
        c.drawString(22 * mm, y, str(qty))
        c.drawString(38 * mm, y, desc)
        c.drawRightString(150 * mm, y, f"Q {money_us(unit)}")
        c.drawRightString(w - 20 * mm, y, f"Q {money_us(amount)}")
        y -= 6.5 * mm

    # Guatemalan invoices usually show prices IVA-included; the IVA line is informative.
    iva = round(total * 12 / 112, 2)
    subtotal = round(total - iva, 2)
    y -= 4 * mm
    c.line(110 * mm, y + 3 * mm, w - 20 * mm, y + 3 * mm)
    for label, value, bold in [
        ("Subtotal (sin IVA):", f"Q {money_us(subtotal)}", False),
        ("IVA (12%):", f"Q {money_us(iva)}", False),
        ("TOTAL A PAGAR:", f"Q {money_us(total)}", True),
    ]:
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 11 if bold else 10)
        c.drawRightString(150 * mm, y, label)
        c.drawRightString(w - 20 * mm, y, value)
        y -= 6.5 * mm

    c.setFont("Helvetica", 8)
    c.setFillColor(colors.grey)
    c.drawString(20 * mm, 28 * mm, "Autorizacion FEL: 9A1B2C3D-4E5F-6789-ABCD-0123456789EF")
    c.drawString(20 * mm, 23 * mm, "Sujeto a pagos trimestrales ISR. Este documento es una representacion impresa de una factura electronica.")
    c.save()
    print(f"wrote tecnosol-gtq.pdf    subtotal={subtotal:.2f} tax={iva:.2f} total={total:.2f}")


# --------------------------------------------------------------------------
# 3. Nordlicht Design GmbH (EUR, European number format)
# --------------------------------------------------------------------------
def nordlicht() -> None:
    c = canvas.Canvas(str(OUT / "nordlicht-eur.pdf"), pagesize=A4)
    w, h = A4

    c.setFont("Helvetica-Bold", 20)
    c.drawRightString(w - 20 * mm, h - 25 * mm, "Nordlicht Design GmbH")
    c.setFont("Helvetica", 9)
    c.drawRightString(w - 20 * mm, h - 31 * mm, "Speicherstadt 7, 20457 Hamburg, Germany")
    c.drawRightString(w - 20 * mm, h - 36 * mm, "VAT ID: DE 812 345 678  |  hello@nordlicht.example")

    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, h - 50 * mm, "Ortiz Automation Studio")
    c.drawString(20 * mm, h - 55 * mm, "Guatemala City, Guatemala")

    c.setFont("Helvetica-Bold", 15)
    c.drawString(20 * mm, h - 72 * mm, "Invoice No. NL-2025-0932")
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, h - 80 * mm, "Date: 21.09.2025")
    c.drawString(20 * mm, h - 86 * mm, "Payment due: 05.10.2025")
    c.drawString(20 * mm, h - 92 * mm, "All amounts in EUR.")

    items = [
        ("Brand identity package (logo, typography, colour system)", 1, 2400.00),
        ("Landing page UI design - 3 revisions", 1, 1150.00),
        ("Icon set (24 custom icons)", 24, 18.50),
    ]
    top = h - 108 * mm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, top, "Pos.")
    c.drawString(32 * mm, top, "Service")
    c.drawRightString(135 * mm, top, "Qty")
    c.drawRightString(160 * mm, top, "Rate")
    c.drawRightString(w - 20 * mm, top, "Net")
    c.setLineWidth(0.5)
    c.line(20 * mm, top - 2 * mm, w - 20 * mm, top - 2 * mm)

    c.setFont("Helvetica", 10)
    y = top - 8 * mm
    subtotal = 0.0
    for i, (desc, qty, unit) in enumerate(items, start=1):
        amount = round(qty * unit, 2)
        subtotal += amount
        c.drawString(22 * mm, y, str(i))
        c.drawString(32 * mm, y, desc)
        c.drawRightString(135 * mm, y, str(qty))
        c.drawRightString(160 * mm, y, money_eu(unit))
        c.drawRightString(w - 20 * mm, y, money_eu(amount))
        y -= 6.5 * mm

    vat = round(subtotal * 0.19, 2)
    total = round(subtotal + vat, 2)
    y -= 4 * mm
    c.line(110 * mm, y + 3 * mm, w - 20 * mm, y + 3 * mm)
    for label, value, bold in [
        ("Net amount:", f"{money_eu(subtotal)} EUR", False),
        ("VAT 19 %:", f"{money_eu(vat)} EUR", False),
        ("Gross total:", f"{money_eu(total)} EUR", True),
    ]:
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 11 if bold else 10)
        c.drawRightString(160 * mm, y, label)
        c.drawRightString(w - 20 * mm, y, value)
        y -= 6.5 * mm

    c.setFont("Helvetica", 8)
    c.setFillColor(colors.grey)
    c.drawString(20 * mm, 30 * mm, "Bank: Hamburger Sparkasse  |  IBAN DE89 2005 0550 1234 5678 90  |  BIC HASPDEHHXXX")
    c.drawString(20 * mm, 25 * mm, "Payable within 14 days without deduction.")
    c.save()
    print(f"wrote nordlicht-eur.pdf   subtotal={subtotal:.2f} tax={vat:.2f} total={total:.2f}")


if __name__ == "__main__":
    acme_cloud()
    tecnosol()
    nordlicht()
