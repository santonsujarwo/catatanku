import io
import os
import re
import tempfile
from datetime import datetime
from typing import Any

import fitz
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from PIL import Image, ImageOps
from paddleocr import PaddleOCR

app = FastAPI(title="CatatKu OCR Service", version="0.1.0")
SECRET = os.getenv("OCR_SERVICE_SECRET", "")
MAX_BYTES = 10 * 1024 * 1024
ocr_engine = None

def get_ocr():
    global ocr_engine
    if ocr_engine is None:
        # English model recognizes Latin-script Indonesian receipts.
        ocr_engine = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    return ocr_engine

def money_values(text: str) -> list[int]:
    values = []
    for match in re.finditer(r"(?<!\d)(\d{1,3}(?:[.,]\d{3})+|\d{4,})(?!\d)", text):
        raw = re.sub(r"\D", "", match.group(1))
        if raw:
            value = int(raw)
            if value >= 100:
                values.append(value)
    return values

def parse_date(text: str) -> str | None:
    patterns = [
        r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b",
        r"\b(\d{4})-(\d{2})-(\d{2})\b",
    ]
    for idx, pattern in enumerate(patterns):
        m = re.search(pattern, text)
        if not m:
            continue
        try:
            if idx == 0:
                day, month, year = map(int, m.groups())
                if year < 100: year += 2000
                return datetime(year, month, day).date().isoformat()
            year, month, day = map(int, m.groups())
            return datetime(year, month, day).date().isoformat()
        except ValueError:
            pass
    return None

def classify(text: str) -> str:
    t = text.lower()
    if any(x in t for x in ["token listrik", "token pln", "no token", "kwh"]):
        if any(x in t for x in ["token", "stroom"]): return "electricity_prepaid"
    if any(x in t for x in ["tagihan listrik", "rekening listrik", "pln pascabayar", "pemakaian kwh"]):
        return "electricity_postpaid"
    if any(x in t for x in ["pajak kendaraan", "pajak motor", "pajak mobil", "samsat", "swdkllj", "pkb"]):
        return "vehicle_tax"
    if any(x in t for x in ["gerbang tol", "ruas tol", "e-toll", "tarif tol"]):
        return "toll_transport"
    if any(x in t for x in ["pdam", "tagihan internet", "indihome", "telkom", "pascabayar"]):
        return "utility"
    if any(x in t for x in ["apotek", "farmasi", "rumah sakit", "klinik", "resep"]):
        return "healthcare"
    if any(x in t for x in ["subtotal", "total", "cashier", "kasir", "qty"]) and any(x in t for x in ["alfamart", "indomaret", "supermarket", "minimarket"]):
        return "grocery"
    if any(x in t for x in ["restoran", "restaurant", "dine in", "service charge", "meja"]):
        return "restaurant"
    if any(x in t for x in ["invoice", "faktur", "tagihan", "bill to"]):
        return "invoice"
    if any(x in t for x in ["total", "jumlah", "tunai", "kembali"]):
        return "grocery"
    return "other"

def extract_merchant(lines: list[str]) -> str:
    for line in lines[:5]:
        cleaned = line.strip(" -*|:")
        if len(cleaned) > 2 and not re.search(r"\d{4,}", cleaned):
            return cleaned[:120]
    return ""

def parse_receipt(text: str, avg_confidence: float) -> dict[str, Any]:
    lines = [x.strip() for x in text.splitlines() if x.strip()]
    kind = classify(text)
    values = money_values(text)
    total = 0
    for line in reversed(lines):
        if re.search(r"\b(total|grand total|jumlah bayar|total bayar|tagihan|nominal)\b", line, re.I):
            found = money_values(line)
            if found:
                total = found[-1]
                break
    if not total and values:
        total = max(values)
    warnings = []
    if not total:
        warnings.append("Total pembayaran belum berhasil dikenali. Silakan isi secara manual.")
    if avg_confidence < 0.75:
        warnings.append("Kualitas pembacaan rendah. Periksa kembali semua informasi.")
    date = parse_date(text) or datetime.now().date().isoformat()
    if not parse_date(text):
        warnings.append("Tanggal tidak ditemukan; tanggal hari ini digunakan sebagai nilai awal.")
    merchant = extract_merchant(lines)
    if not merchant:
        warnings.append("Nama toko atau penyedia belum ditemukan.")
    items = []
    # Conservative line parser: only accept lines that appear to contain a description and a price.
    for line in lines:
        nums = money_values(line)
        if len(nums) == 1 and nums[0] != total and not re.search(r"\b(total|subtotal|pajak|ppn|cash|tunai|kembali|diskon|admin)\b", line, re.I):
            desc = re.sub(r"\d[\d.,]*\s*$", "", line).strip(" -:|")
            if len(desc) >= 3 and not re.fullmatch(r"[\d\s.,]+", desc):
                items.append({"description": desc[:160], "quantity": 1, "unit": "", "unit_price": nums[0], "line_total": nums[0], "line_type": "product", "category": "Belanja", "confidence": round(avg_confidence, 4), "source_text": line[:200]})
    token_detected = bool(re.search(r"\b\d{20}\b", text))
    if token_detected:
        warnings.append("Nomor token terdeteksi dan sengaja tidak disimpan.")
    prepaid_value = None
    if kind == "electricity_prepaid":
        for line in lines:
            if re.search(r"nominal|pembelian|rupiah", line, re.I):
                found = money_values(line)
                if found: prepaid_value = found[-1]; break
    kwh = None
    kwh_match = re.search(r"(\d+[.,]?\d*)\s*kwh", text, re.I)
    if kwh_match:
        try: kwh = float(kwh_match.group(1).replace(",", "."))
        except ValueError: pass
    return {
        "document_type": kind, "merchant_name": merchant, "transaction_date": date,
        "total_amount": total, "subtotal": None, "tax_amount": None, "admin_fee": None,
        "service_fee": None, "discount_amount": None, "billing_period": "",
        "usage_kwh": kwh if kind == "electricity_postpaid" else None,
        "purchased_value": prepaid_value, "received_kwh": kwh if kind == "electricity_prepaid" else None,
        "customer_reference": "", "token_detected": token_detected, "items": items,
        "warnings": warnings, "confidence": round(avg_confidence, 4)
    }

def image_pages(data: bytes, mime: str) -> list[Image.Image]:
    if mime == "application/pdf":
        doc = fitz.open(stream=data, filetype="pdf")
        if doc.page_count > 8:
            raise HTTPException(status_code=413, detail="PDF maksimal 8 halaman.")
        pages = []
        for page in doc:
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            pages.append(Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB"))
        return pages
    image = Image.open(io.BytesIO(data))
    image = ImageOps.exif_transpose(image).convert("RGB")
    return [image]

@app.get("/health")
def health():
    return {"status": "ok", "engine": "PaddleOCR"}

@app.post("/scan")
async def scan(file: UploadFile = File(...), x_ocr_secret: str | None = Header(default=None)):
    if not SECRET or x_ocr_secret != SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")
    allowed = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=415, detail="Format file tidak didukung.")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Ukuran file maksimal 10 MB.")
    try:
        pages = image_pages(data, file.content_type)
        engine = get_ocr()
        all_lines, confidences = [], []
        for page in pages:
            with tempfile.NamedTemporaryFile(suffix=".png") as tmp:
                page.save(tmp.name, format="PNG")
                result = engine.ocr(tmp.name, cls=True)
            for block in result or []:
                for row in block or []:
                    if len(row) >= 2 and row[1]:
                        text_value, confidence = row[1][0], float(row[1][1])
                        all_lines.append(text_value)
                        confidences.append(confidence)
        if not all_lines:
            raise HTTPException(status_code=422, detail="Tidak ada teks yang dapat dibaca. Coba foto ulang dengan pencahayaan lebih baik.")
        raw_text = "\n".join(all_lines)
        avg_confidence = sum(confidences) / max(len(confidences), 1)
        return {"engine": "PaddleOCR", "page_count": len(pages), "raw_text": raw_text[:20000], "draft": parse_receipt(raw_text, avg_confidence)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {type(exc).__name__}")
