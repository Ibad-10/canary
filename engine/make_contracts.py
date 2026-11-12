"""Generate 3 SYNTHETIC facility-agreement PDFs into engine/contracts/ (BTR, PBSA, Office).
Terms come from engine.loans.build() when available (ids CAN-001 / CAN-006 / CAN-010), else placeholders.
Clause wording is inspired by LOAN_RULES.md (Hamlins / Arthur Cox / LMA REF style). Not real legal text."""
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.lib import colors

OUT = Path(__file__).resolve().parent / "contracts"
WANT = {"BTR": "CAN-001", "PBSA": "CAN-006", "Office": "CAN-010"}
PLACEHOLDER = {
    "BTR": {"id": "CAN-001", "name": "Placeholder BTR block", "borrower": "Placeholder BTR Holdings Ltd", "sector": "BTR",
            "amount_gbp": 18000000, "rate_pct": 5.75, "value_gbp": 32000000,
            "covenants": {"icr_min": 1.25, "icr_cash_trap": 1.35, "ltv_max": 65.0, "ltv_cash_trap": 60.0, "test": "ICR"}},
    "PBSA": {"id": "CAN-006", "name": "Placeholder student block", "borrower": "Placeholder Student Living Ltd", "sector": "PBSA",
             "amount_gbp": 2600000, "rate_pct": 5.75, "value_gbp": 4400000,
             "covenants": {"icr_min": 1.30, "icr_cash_trap": 1.40, "ltv_max": 65.0, "ltv_cash_trap": 60.0, "test": "ICR"}},
    "Office": {"id": "CAN-010", "name": "Placeholder office units", "borrower": "Placeholder Office Investments Ltd", "sector": "Office",
               "amount_gbp": 2700000, "rate_pct": 6.5, "value_gbp": 4800000,
               "covenants": {"icr_min": 1.35, "icr_cash_trap": 1.45, "ltv_max": 65.0, "ltv_cash_trap": 60.0, "test": "ICR"}},
}
COMPLIANCE = {"BTR": "fire risk assessment (FRA), electrical installation condition report (EICR) and, where applicable, EWS1 form",
              "PBSA": "fire risk assessment (FRA), electrical installation condition report (EICR) and fire alarm service certificate",
              "Office": "fire risk assessment (FRA), electrical installation condition report (EICR) and asbestos management survey"}
USE = {"BTR": "a build-to-rent residential block", "PBSA": "a purpose-built student accommodation scheme", "Office": "commercial office units"}
FOOT = "SYNTHETIC - for hackathon demo"


def _terms() -> dict:
    try:
        from engine import loans
        by = {l["id"]: l for l in loans.build()}
        return {s: by[i] for s, i in WANT.items()}
    except Exception as e:
        print(f"make_contracts: engine.loans unavailable ({type(e).__name__}); using placeholder terms")
        return PLACEHOLDER


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica-Bold", 8)
    canvas.setFillColor(colors.HexColor("#b00020"))
    canvas.drawCentredString(A4[0] / 2, 12 * mm, FOOT)
    canvas.setFillColor(colors.grey)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_pdf(loan: dict) -> Path:
    c, s = loan["covenants"], loan["sector"]
    ss = getSampleStyleSheet()
    H = ParagraphStyle("H", parent=ss["Heading2"], fontSize=11, spaceBefore=10, spaceAfter=4)
    B = ParagraphStyle("B", parent=ss["BodyText"], fontSize=9.5, leading=13)
    T = ParagraphStyle("T", parent=ss["Title"], fontSize=16)
    amount = f"GBP {loan['amount_gbp']:,.0f}"
    rate = f"{loan['rate_pct']:.2f}"
    cure_cov = c["icr_min"]
    story = [
        Paragraph("FACILITY AGREEMENT", T),
        Paragraph(f"Term loan facility secured on {USE[s]} ({loan['name']}). Agreement reference {loan['id']}-FA. "
                  "<b>This document is entirely fictional and was generated for a hackathon demonstration.</b>", B),
        Spacer(1, 6),
        Paragraph("1. Parties", H),
        Table([["Borrower", loan["borrower"] + " (a fictional special purpose company)"],
               ["Lender", "Canary Demo Bank plc (fictional)"],
               ["Security Agent", "Canary Demo Security Services Ltd (fictional)"]],
              colWidths=[35 * mm, 125 * mm],
              style=TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9.5), ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
                                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold")])),
        Paragraph("2. The Facility", H),
        Paragraph(f"2.1 The Lender makes available to the Borrower a sterling interest-only term loan facility in an aggregate "
                  f"amount of <b>{amount}</b> (the Facility Amount).", B),
        Paragraph(f"2.2 Interest is payable quarterly in arrears at a rate of <b>{rate}% per annum</b> (the Interest Rate). "
                  "The Interest Rate is treated as fixed for the term of the Facility for the purpose of the Financial Covenants.", B),
        Paragraph("2.3 The term of the Facility is five (5) years from the Utilisation Date. Capital is repaid in full on the Final Maturity Date.", B),
        Paragraph("3. Financial Covenants", H),
        Paragraph(f"3.1 <b>Interest Cover.</b> The Borrower shall ensure that ICR in respect of each Test Date is not less than "
                  f"<b>{c['icr_min']:.2f}x</b> (the Default ICR). ICR means Net Rental Income divided by Interest for the relevant Test Period. "
                  "Net Rental Income means rent actually received after deduction of ground rent, non-recoverable service charge, "
                  "irrecoverable operating costs and property taxes; arrears older than 60 days are excluded.", B),
        Paragraph(f"3.2 <b>Loan to Value.</b> The Borrower shall ensure that LTV does not at any time exceed <b>{c['ltv_max']:.1f}%</b> "
                  "(the Default LTV). LTV means the Facility Amount divided by the Market Value determined by an independent valuer "
                  "acceptable to the Lender. The Lender may require a valuation once per year at the Borrower's cost.", B),
        Paragraph(f"3.3 <b>Cash Trap.</b> If on any Test Date ICR is less than <b>{c['icr_cash_trap']:.2f}x</b> (the Cash Trap ICR) or LTV exceeds "
                  f"<b>{c['ltv_cash_trap']:.1f}%</b> (the Cash Trap LTV), all surplus cash standing to the credit of the Rent Account shall be "
                  "retained in a blocked account and not released to the Borrower until both tests have been met on two consecutive Test Dates. "
                  "The Lender may apply trapped cash in prepayment of the Facility.", B),
        Paragraph("3.4 <b>Test Dates.</b> The Financial Covenants are tested quarterly on 31 March, 30 June, 30 September and 31 December "
                  "by reference to the most recent quarter and the Compliance Certificate delivered for it. "
                  f"The primary income test under this Agreement is <b>{c.get('test', 'ICR')}</b>.", B),
        Paragraph(f"3.5 <b>Equity Cure.</b> If a Financial Covenant is breached, the Borrower may within 20 Business Days of the Test Date "
                  f"inject cash as equity or subordinated loan which is applied in prepayment of the Facility and is treated as reducing the Facility Amount "
                  f"when the covenant is recalculated. The equity cure right may be used a <b>maximum of 2 times</b> over the life of the Facility and "
                  "not in consecutive Test Periods.", B),
        Paragraph("4. Information Covenants", H),
        Paragraph("4.1 The Borrower shall deliver to the Lender: (a) a rent roll, with arrears and voids, within 15 Business Days of each Test Date; "
                  "(b) a quarterly Compliance Certificate signed by two directors confirming compliance with Clause 3; "
                  f"(c) evidence that the Property has in date: {COMPLIANCE[s]}; "
                  "(d) annual accounts within 120 days of year end; and (e) prompt notice of any tenant insolvency, litigation, enforcement notice or insurance claim.", B),
        Paragraph("4.2 Failure to deliver information within five Business Days of a written request is itself a breach of this Agreement, "
                  "whether or not the Financial Covenants are met.", B),
        Paragraph("5. Property Covenants", H),
        Paragraph("5.1 The Borrower shall keep the Property insured (including loss of rent), keep it in good repair, comply with all laws "
                  "including the Building Safety Act 2022 and the Regulatory Reform (Fire Safety) Order 2005, and not grant, vary or surrender any lease "
                  "or dispose of the Property without the Lender's prior written consent.", B),
        Paragraph("6. Events of Default", H),
        Paragraph("6.1 Each of the following is an Event of Default: (a) non-payment of any amount when due; (b) breach of a Financial Covenant "
                  "that is not cured under Clause 3.5; (c) breach of an Information or Property Covenant not remedied within 10 Business Days; "
                  "(d) misrepresentation; (e) insolvency or insolvency proceedings of the Borrower; (f) loss or impairment of security; "
                  "(g) a Material Adverse Change.", B),
        Paragraph("6.2 On an Event of Default that is continuing the Lender may cancel the Facility, declare all amounts immediately due "
                  "(acceleration), enforce the security and appoint a receiver under the Law of Property Act 1925.", B),
        Paragraph("7. Governing law", H),
        Paragraph("This Agreement is governed by the law of England and Wales. Signatures are intentionally omitted: this is a specimen for demonstration only.", B),
    ]
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{loan['id']}_{s}_facility.pdf"
    SimpleDocTemplate(str(path), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=22 * mm,
                      title=f"Synthetic facility agreement {loan['id']}", author="Canary hackathon demo").build(
        story, onFirstPage=_footer, onLaterPages=_footer)
    return path


def main() -> list[Path]:
    terms = _terms()
    return [build_pdf(terms[s]) for s in ("BTR", "PBSA", "Office")]


if __name__ == "__main__":
    for p in main():
        print(p)
