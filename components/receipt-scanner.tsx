"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type DocType = "grocery"|"restaurant"|"electricity_prepaid"|"electricity_postpaid"|"utility"|"toll_transport"|"vehicle_tax"|"healthcare"|"invoice"|"other";
type ReceiptItem = { description:string; quantity:number; unit:string; unit_price:number|null; line_total:number; line_type:string; category:string; confidence:number|null };
type Draft = { document_type:DocType; merchant_name:string; transaction_date:string; total_amount:number; subtotal:number|null; tax_amount:number|null; admin_fee:number|null; service_fee:number|null; discount_amount:number|null; billing_period:string; usage_kwh:number|null; purchased_value:number|null; received_kwh:number|null; customer_reference:string; token_detected:boolean; items:ReceiptItem[]; warnings:string[]; confidence:number };
const labels:Record<DocType,string>={grocery:"Belanja",restaurant:"Restoran",electricity_prepaid:"Token listrik",electricity_postpaid:"Listrik pascabayar",utility:"Tagihan utilitas",toll_transport:"Tol / transportasi",vehicle_tax:"Pajak kendaraan",healthcare:"Kesehatan",invoice:"Invoice",other:"Lainnya"};
const money=(n:number)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n||0);
const emptyDraft:Draft={document_type:"other",merchant_name:"",transaction_date:new Date().toISOString().slice(0,10),total_amount:0,subtotal:null,tax_amount:null,admin_fee:null,service_fee:null,discount_amount:null,billing_period:"",usage_kwh:null,purchased_value:null,received_kwh:null,customer_reference:"",token_detected:false,items:[],warnings:[],confidence:0};

export default function ReceiptScanner({user,onSaved,onClose}:{user:User;onSaved:(tx:{id:string;title:string;amount:number;kind:"expense";category:string;date:string})=>void;onClose:()=>void}) {
  const [file,setFile]=useState<File|null>(null);
  const [preview,setPreview]=useState("");
  const [storagePath,setStoragePath]=useState("");
  const [draft,setDraft]=useState<Draft>(emptyDraft);
  const [busy,setBusy]=useState(false);
  const [step,setStep]=useState<"choose"|"review">("choose");
  const [message,setMessage]=useState("");
  const cameraRef=useRef<HTMLInputElement>(null);
  const fileRef=useRef<HTMLInputElement>(null);
  const allowed=["image/jpeg","image/png","image/webp","application/pdf"];
  useEffect(()=>{if(!file)return;const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
  const canScan=!!file&&!busy;
  const totalItems=useMemo(()=>draft.items.reduce((s,i)=>s+Number(i.line_total||0),0),[draft.items]);
  function choose(f?:File){setMessage("");if(!f)return;if(!allowed.includes(f.type)){setMessage("Format tidak didukung. Gunakan JPG, PNG, WebP, atau PDF.");return;}if(f.size>10*1024*1024){setMessage("Ukuran file maksimal 10 MB.");return;}setFile(f);}
  async function scan(){
    if(!file||!supabase)return;setBusy(true);setMessage("Mengunggah dokumen...");
    try{
      let path=storagePath;
      if(!path){
        const safeName=file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g,"-").slice(-90)||"receipt";
        path=user.id+"/"+crypto.randomUUID()+"-"+safeName;
        const {error:uploadError}=await supabase.storage.from("receipts").upload(path,file,{contentType:file.type,upsert:false});
        if(uploadError)throw new Error("Upload gagal: "+uploadError.message);
        setStoragePath(path);
      }
      setMessage("Membaca isi nota dengan OCR...");
      const {data:{session}}=await supabase.auth.getSession();
      if(!session?.access_token)throw new Error("Sesi login berakhir. Silakan login kembali.");
      const response=await fetch("/api/receipt/scan",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},body:JSON.stringify({storagePath:path})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Dokumen gagal dibaca.");
      setDraft({...emptyDraft,...result.draft,items:Array.isArray(result.draft?.items)?result.draft.items:[]});
      setStep("review");setMessage("");
    }catch(e){setMessage(e instanceof Error?e.message:"Terjadi kesalahan saat membaca nota.");}
    finally{setBusy(false);}
  }
  function update<K extends keyof Draft>(key:K,value:Draft[K]){setDraft(d=>({...d,[key]:value}));}
  function updateItem(index:number,patch:Partial<ReceiptItem>){setDraft(d=>({...d,items:d.items.map((item,i)=>i===index?{...item,...patch}:item)}));}
  async function save(){
    if(!supabase)return;
    if(!draft.total_amount||draft.total_amount<=0){setMessage("Total pembayaran harus diisi.");return;}
    setBusy(true);setMessage("Menyimpan transaksi...");
    try{
      if(!storagePath)throw new Error("Lokasi file nota tidak ditemukan. Silakan scan ulang.");
      const category=draft.document_type==="grocery"?"Belanja":draft.document_type==="restaurant"?"Makanan":["electricity_prepaid","electricity_postpaid","utility"].includes(draft.document_type)?"Tagihan":draft.document_type==="toll_transport"?"Transportasi":draft.document_type==="vehicle_tax"?"Transportasi":draft.document_type==="healthcare"?"Kesehatan":"Lainnya";
      const title=draft.merchant_name.trim()||labels[draft.document_type];
      const {data:transactionId,error:saveError}=await supabase.rpc("create_transaction_with_receipt",{p_transaction:{title,amount:Math.round(draft.total_amount),kind:"expense",category,transaction_date:draft.transaction_date},p_receipt:{document_type:draft.document_type,merchant_name:draft.merchant_name||null,document_date:draft.transaction_date,storage_path:storagePath,original_filename:file?.name||null,mime_type:file?.type||"application/octet-stream",file_size_bytes:file?.size||null,subtotal:draft.subtotal,tax_amount:draft.tax_amount,admin_fee:draft.admin_fee,service_fee:draft.service_fee,discount_amount:draft.discount_amount,total_amount:draft.total_amount,billing_period:draft.billing_period||null,usage_kwh:draft.usage_kwh,purchased_value:draft.purchased_value,received_kwh:draft.received_kwh,customer_reference:draft.customer_reference||null,ocr_engine:"PaddleOCR",ocr_status:"needs_review",ocr_confidence:draft.confidence,ocr_warnings:draft.warnings,extracted_data:{token_detected:draft.token_detected}},p_items:draft.items.map((i,index)=>({...i,sort_order:index,user_id:user.id}))});
      if(saveError)throw saveError;
      onSaved({id:transactionId,title,amount:Math.round(draft.total_amount),kind:"expense",category,date:draft.transaction_date});
      onClose();
    }catch(e){setMessage(e instanceof Error?e.message:"Transaksi gagal disimpan.");}
    finally{setBusy(false);}
  }
  return <div className="receipt-overlay" onClick={onClose}><section className="receipt-modal" onClick={e=>e.stopPropagation()}>
    <header className="receipt-head"><div><span className="eyebrow">CATATKU SCAN</span><h2>{step==="choose"?"Scan nota atau tagihan":"Periksa hasil pembacaan"}</h2><p>{step==="choose"?"Foto langsung atau pilih dokumen dari perangkat.":"Pastikan data sudah benar sebelum disimpan."}</p></div><button className="receipt-close" onClick={onClose} aria-label="Tutup">×</button></header>
    {step==="choose"?<>
      <div className="receipt-upload">
        <div className="receipt-camera-icon">▧</div><b>Masukkan nota atau bukti pembayaran</b><span>JPG, PNG, WebP, atau PDF · Maksimal 10 MB</span>
        <div className="receipt-actions"><button className="primary" onClick={()=>cameraRef.current?.click()}>Buka kamera</button><button className="secondary" onClick={()=>fileRef.current?.click()}>Pilih file</button></div>
        <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={e=>choose(e.target.files?.[0])}/>
        <input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>choose(e.target.files?.[0])}/>
      </div>
      {file&&<div className="receipt-file">{file.type==="application/pdf"?"PDF":<img src={preview} alt="Preview nota"/>}<div><b>{file.name}</b><small>{(file.size/1024/1024).toFixed(2)} MB</small></div><button onClick={()=>{setFile(null);setPreview("");}}>Hapus</button></div>}
      {message&&<p className="receipt-message">{message}</p>}
      <button className="primary receipt-submit" disabled={!canScan} onClick={()=>void scan()}>{busy?"Memproses...":"Baca nota →"}</button>
    </>:<>
      <div className="receipt-review-grid">
        <div className="receipt-preview">{file?.type==="application/pdf"?<div className="pdf-preview">PDF<br/><small>{file.name}</small></div>:<img src={preview} alt="Dokumen yang dipindai"/>}</div>
        <div className="receipt-fields">
          <label>Jenis dokumen<select value={draft.document_type} onChange={e=>update("document_type",e.target.value as DocType)}>{Object.entries(labels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
          <label>Nama toko / penyedia<input value={draft.merchant_name} onChange={e=>update("merchant_name",e.target.value)}/></label>
          <label>Tanggal<input type="date" value={draft.transaction_date} onChange={e=>update("transaction_date",e.target.value)}/></label>
          <label>Total pembayaran (Rp)<input type="number" min="0" value={draft.total_amount||""} onChange={e=>update("total_amount",Number(e.target.value))}/></label>
          {draft.document_type==="electricity_prepaid"&&<><label>Nominal token (Rp)<input type="number" value={draft.purchased_value??""} onChange={e=>update("purchased_value",e.target.value===""?null:Number(e.target.value))}/></label><label>Energi (kWh)<input type="number" step="0.001" value={draft.received_kwh??""} onChange={e=>update("received_kwh",e.target.value===""?null:Number(e.target.value))}/></label><p className="receipt-note">Nomor token tidak disimpan otomatis demi keamanan.</p></>}
          {draft.document_type==="electricity_postpaid"&&<><label>Periode tagihan<input value={draft.billing_period} onChange={e=>update("billing_period",e.target.value)}/></label><label>Pemakaian (kWh)<input type="number" step="0.001" value={draft.usage_kwh??""} onChange={e=>update("usage_kwh",e.target.value===""?null:Number(e.target.value))}/></label></>}
          <label>Biaya administrasi (Rp)<input type="number" value={draft.admin_fee??""} onChange={e=>update("admin_fee",e.target.value===""?null:Number(e.target.value))}/></label>
        </div>
      </div>
      <div className="receipt-items-head"><b>Rincian item / pembayaran</b><button className="secondary" onClick={()=>update("items",[...draft.items,{description:"Item baru",quantity:1,unit:"",unit_price:null,line_total:0,line_type:"product",category:"Belanja",confidence:null}])}>+ Tambah item</button></div>
      {draft.items.length?draft.items.map((item,index)=><div className="receipt-item-edit" key={index}><input aria-label="Nama item" value={item.description} onChange={e=>updateItem(index,{description:e.target.value})}/><input aria-label="Jumlah" type="number" min="0.001" step="0.001" value={item.quantity} onChange={e=>updateItem(index,{quantity:Number(e.target.value)})}/><input aria-label="Total item" type="number" min="0" value={item.line_total} onChange={e=>updateItem(index,{line_total:Number(e.target.value)})}/><button onClick={()=>update("items",draft.items.filter((_,i)=>i!==index))}>×</button></div>):<p className="receipt-note">Tidak ada rincian item yang terbaca. Transaksi tetap bisa disimpan sebagai satu total pembayaran.</p>}
      {draft.items.length>0&&<p className="receipt-note">Jumlah rincian terbaca: {money(totalItems)} · Total nota: {money(draft.total_amount)}</p>}
      {draft.warnings.length>0&&<div className="receipt-warning">{draft.warnings.map((w,i)=><p key={i}>• {w}</p>)}</div>}
      {message&&<p className="receipt-message">{message}</p>}
      <div className="receipt-footer-actions"><button className="secondary" disabled={busy} onClick={()=>{setStep("choose");setMessage("");}}>Pilih ulang</button><button className="primary" disabled={busy} onClick={()=>void save()}>{busy?"Menyimpan...":"Konfirmasi & simpan transaksi"}</button></div>
    </>}
  </section></div>;
}
