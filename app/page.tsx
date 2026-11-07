"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import ReceiptScanner from "@/components/receipt-scanner";

type Kind = "income" | "expense";
type Tx = { id: string; title: string; amount: number; kind: Kind; category: string; date: string };
const months = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const fmt = (n:number) => new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n);
const monthKey = (s:string) => s.slice(0,7);
const today = () => { const d=new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"); };
const categoryWords: Record<string,string[]> = {
  Makanan:["makan","nasi","kopi","resto","jajan","bakso","ayam","roti","minum"],
  Transportasi:["parkir","bensin","bbm","tol","ojek","grab","gojek","bus","kereta","transport"],
  Belanja:["belanja","supermarket","shopee","tokopedia","pakaian","baju"],
  Tagihan:["listrik","air","internet","wifi","pulsa","token","tagihan","cicilan"],
  Kesehatan:["obat","dokter","klinik","vitamin"],
  Hiburan:["film","bioskop","game","liburan","hiburan","netflix"],
  Rumah:["perabot","sewa","kos","kontrakan"],
  Gaji:["gaji","salary","honor"],
  Freelance:["freelance","project","proyek","client","klien","desain","website"],
  Investasi:["investasi","saham","reksa dana","deposito"]
};
function parseAmount(s:string) {
  const m=s.toLowerCase().replace(/rp/gi,"").replace(/\s/g,"").match(/(\d+(?:[.,]\d+)?)(jt|juta|m|rb|ribu|k)?/);
  if(!m) return 0;
  const n=Number(m[1].replace(",",".")); const u=m[2];
  return Math.round(n*(["jt","juta","m"].includes(u??"")?1e6:["rb","ribu","k"].includes(u??"")?1e3:1));
}
function parseInput(input:string) {
  return input.split(/;|,\s+(?=[\p{L}])/u).map(s=>s.trim()).filter(Boolean).flatMap(part=>{
    const amount=parseAmount(part); if(!amount) return [];
    const low=part.toLowerCase();
    const income=["gaji","freelance","project","proyek","pemasukan","terima","bonus","jualan","penjualan","income"].some(w=>low.includes(w));
    let category=income?"Pemasukan lain":"Lainnya";
    for(const [name,words] of Object.entries(categoryWords)) if(words.some(w=>low.includes(w))){category=name;break;}
    if(income&&!["Gaji","Freelance","Investasi"].includes(category)) category="Pemasukan lain";
    const title=part.replace(/rp\s?/i,"").replace(/\b\d+(?:[.,]\d+)?\s*(?:jt|juta|m|rb|ribu|k)?\b/i,"").replace(/\b(rupiah|masuk|keluar)\b/gi,"").replace(/[,:-]/g," ").trim();
    return [{title:title?title[0].toUpperCase()+title.slice(1):(income?"Pemasukan":"Pengeluaran"),amount,kind:(income?"income":"expense") as Kind,category}];
  });
}
function Icon({children}:{children:string}) { return <span aria-hidden="true">{children}</span>; }

export default function Home() {
  const [user,setUser]=useState<User|null>(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [mode,setMode]=useState<"login"|"signup">("login");
  const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [authMessage,setAuthMessage]=useState("");
  const [transactions,setTransactions]=useState<Tx[]>([]);
  const [loading,setLoading]=useState(false);
  const [entry,setEntry]=useState(""); const [error,setError]=useState("");
  const [selectedMonth,setSelectedMonth]=useState(today().slice(0,7));
  const [filter,setFilter]=useState<"all"|Kind>("all");
  const [editing,setEditing]=useState<Tx|null>(null);
  const [scannerOpen,setScannerOpen]=useState(false);

  useEffect(()=>{
    if(!supabase){setAuthLoading(false);return;}
    supabase.auth.getSession().then(({data})=>{setUser(data.session?.user??null);setAuthLoading(false);});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>setUser(session?.user??null));
    return ()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{
    if(!supabase||!user){setTransactions([]);return;}
    let active=true; setLoading(true);
    supabase.from("transactions").select("id,title,amount,kind,category,transaction_date").eq("user_id",user.id).order("transaction_date",{ascending:false}).order("created_at",{ascending:false})
      .then(({data,error:dbError})=>{
        if(!active)return;
        if(dbError)setError("Gagal memuat transaksi: "+dbError.message);
        else setTransactions((data??[]).map((r:any)=>({id:r.id,title:r.title,amount:Number(r.amount),kind:r.kind,category:r.category,date:r.transaction_date})));
        setLoading(false);
      });
    return ()=>{active=false;};
  },[user]);

  const monthTx=useMemo(()=>transactions.filter(t=>monthKey(t.date)===selectedMonth),[transactions,selectedMonth]);
  const income=monthTx.filter(t=>t.kind==="income").reduce((s,t)=>s+t.amount,0);
  const expense=monthTx.filter(t=>t.kind==="expense").reduce((s,t)=>s+t.amount,0);
  const balance=income-expense;
  const byCategory=useMemo(()=>{
    const m=new Map<string,number>(); monthTx.filter(t=>t.kind==="expense").forEach(t=>m.set(t.category,(m.get(t.category)||0)+t.amount));
    return [...m.entries()].sort((a,b)=>b[1]-a[1]);
  },[monthTx]);
  const maxCat=Math.max(1,...byCategory.map(x=>x[1]));
  const visible=monthTx.filter(t=>filter==="all"||t.kind===filter).sort((a,b)=>b.date.localeCompare(a.date));

  async function submitAuth(e:FormEvent){
    e.preventDefault(); if(!supabase)return; setAuthMessage("");
    const result=mode==="signup"?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password});
    if(result.error)setAuthMessage(result.error.message);
    else if(mode==="signup"&&!result.data.session)setAuthMessage("Akun dibuat. Silakan cek email untuk konfirmasi, lalu login.");
    else setAuthMessage("Berhasil masuk.");
  }
  async function add(e:FormEvent){
    e.preventDefault(); const parsed=parseInput(entry);
    if(!parsed.length){setError("Nominal belum terbaca. Contoh: nasi padang 45rb atau gaji 5jt.");return;}
    if(!supabase||!user)return;setError("");
    const {data,error:dbError}=await supabase.from("transactions").insert(parsed.map(t=>({...t,user_id:user.id,transaction_date:today()}))).select("id,title,amount,kind,category,transaction_date");
    if(dbError){setError("Gagal menyimpan: "+dbError.message);return;}
    const saved=(data??[]).map((r:any)=>({id:r.id,title:r.title,amount:Number(r.amount),kind:r.kind,category:r.category,date:r.transaction_date}));
    setTransactions(prev=>[...saved,...prev]);setEntry("");
  }
  async function saveEdit(e:FormEvent){
    e.preventDefault();if(!editing||!supabase||!user)return;
    const {error:dbError}=await supabase.from("transactions").update({title:editing.title,amount:editing.amount,kind:editing.kind,category:editing.category,transaction_date:editing.date}).eq("id",editing.id).eq("user_id",user.id);
    if(dbError){setError(dbError.message);return;}
    setTransactions(prev=>prev.map(t=>t.id===editing.id?editing:t));setEditing(null);
  }
  async function remove(id:string){
    if(!supabase||!user)return;
    const {error:dbError}=await supabase.from("transactions").delete().eq("id",id).eq("user_id",user.id);
    if(dbError){setError(dbError.message);return;}setTransactions(prev=>prev.filter(t=>t.id!==id));
  }
  function shiftMonth(delta:number){const d=new Date(selectedMonth+"-01T12:00:00");d.setMonth(d.getMonth()+delta);setSelectedMonth(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"));}

  if(!supabase)return <main className="auth-screen"><section className="auth-card"><div className="auth-brand"><span className="brand-mark">▣</span>catat<span className="brand-accent">ku.</span></div><h1>Hubungkan Supabase</h1><p>Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY pada environment variables, lalu jalankan kembali aplikasi.</p></section></main>;
  if(authLoading)return <main className="auth-screen"><section className="auth-card">Memeriksa sesi akun...</section></main>;
  if(!user)return <main className="auth-screen"><section className="auth-card"><div className="auth-brand"><span className="brand-mark">▣</span>catat<span className="brand-accent">ku.</span></div><div className="eyebrow">PERSONAL FINANCE TRACKER</div><h1>{mode==="login"?"Selamat datang kembali":"Buat akun CatatKu"}</h1><p>Masuk untuk menyimpan dan mengakses catatan keuangan dari perangkat mana pun.</p><form className="auth-form" onSubmit={submitAuth}><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="nama@email.com"/></label><label>Password<input type="password" minLength={6} value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Minimal 6 karakter"/></label><button className="primary" type="submit">{mode==="login"?"Masuk":"Daftar akun"}</button></form>{authMessage&&<p className="auth-message">{authMessage}</p>}<p className="auth-switch">{mode==="login"?"Belum punya akun?":"Sudah punya akun?"} <button onClick={()=>{setMode(mode==="login"?"signup":"login");setAuthMessage("");}}>{mode==="login"?"Daftar":"Login"}</button></p></section></main>;

  return <main className="shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">▣</span><span>catat<span className="brand-accent">ku.</span></span></div><div className="side-label">MENU</div><a className="nav active" href="#overview">▦ &nbsp; Ringkasan</a><a className="nav" href="#transactions">↕ &nbsp; Transaksi</a><a className="nav" href="#analysis">◔ &nbsp; Analisis</a><div className="side-bottom"><div className="tip"><b>✦ Keuangan lebih rapi</b><p>Catat sedikit demi sedikit, lihat hasilnya setiap bulan.</p></div><div className="profile"><button className="logout" onClick={()=>void supabase.auth.signOut()}>Keluar</button><b>Keuangan pribadi</b><small>{user.email}</small></div></div></aside>
    <section className="main"><header className="topbar"><div><div className="eyebrow">PERSONAL FINANCE TRACKER</div><h1>Catatan keuangan</h1><p className="sub">Pantau uang masuk dan keluar, tanpa ribet.</p></div><div className="month"><button onClick={()=>shiftMonth(-1)}>‹</button>{months[Number(selectedMonth.slice(5,7))-1]} {selectedMonth.slice(0,4)}<button onClick={()=>shiftMonth(1)}>›</button></div></header>
      <section className="entry"><h2>Catat transaksi cukup satu kalimat.</h2><p>Ketik seperti sedang chat. CatatKu yang mengurus sisanya.</p><form className="entry-form" onSubmit={add}><input value={entry} onChange={e=>setEntry(e.target.value)} placeholder="Contoh: nasi padang 45rb, parkir 5rb, gaji 5jt..."/><button className="primary">Catat transaksi →</button></form>{error&&<p className="error">{error}</p>}<div className="examples">Coba: {["Kopi 25rb","Parkir 5rb","Freelance 2jt"].map(x=><button key={x} onClick={()=>setEntry(x)}>{x}</button>)}</div></section>
      <section id="overview" className="stats"><article className="stat"><div className="stat-label">Total pemasukan</div><strong>{fmt(income)}</strong><small className="hint green">↑ Uang yang diterima bulan ini</small></article><article className="stat"><div className="stat-label">Total pengeluaran</div><strong>{fmt(expense)}</strong><small className="hint">Uang yang digunakan bulan ini</small></article><article className="stat"><div className="stat-label">Saldo bersih</div><strong>{fmt(balance)}</strong><small className={"hint "+(balance>=0?"green":"red")}>{balance>=0?"Pemasukan lebih besar dari pengeluaran":"Pengeluaran melebihi pemasukan"}</small></article></section>
      <section className="grid"><article id="analysis" className="panel"><h3>Analisis pengeluaran</h3><p className="panel-sub">Kategori pengeluaran bulan ini</p>{byCategory.length?<><div className="top-spend"><div><small>Pengeluaran terbesar</small><b>{byCategory[0][0]}</b></div><strong>{fmt(byCategory[0][1])}</strong></div>{byCategory.map(([name,value])=><div className="cat-row" key={name}><div className="cat-meta"><span>{name}</span><b>{fmt(value)}</b></div><div className="track"><div className="fill" style={{width:(value/maxCat*100)+"%"}}/></div><small>{expense?Math.round(value/expense*100):0}% dari pengeluaran</small></div>)}</>:<div className="empty">Belum ada pengeluaran tercatat.</div>}</article>
      <article className="panel"><h3>Ringkasan bulan ini</h3><p className="panel-sub">Gambaran arus keuanganmu</p><div className="flow"><span className="dot"/><div><b>Pemasukan</b><small>{monthTx.filter(t=>t.kind==="income").length} transaksi</small></div><strong className="green">+{fmt(income)}</strong></div><div className="flow"><span className="dot exp"/><div><b>Pengeluaran</b><small>{monthTx.filter(t=>t.kind==="expense").length} transaksi</small></div><strong className="red">-{fmt(expense)}</strong></div><div className="rule"/><div className="total"><span>Sisa uang</span><b>{fmt(balance)}</b></div></article></section>
      <section id="transactions" className="panel"><div className="tx-head"><div><h3>Transaksi terbaru</h3><p className="panel-sub">Semua catatan keuangan di bulan terpilih {loading?"· Memuat...":""}</p></div><div className="filters">{(["all","income","expense"] as const).map(k=><button key={k} className={filter===k?"active":""} onClick={()=>setFilter(k)}>{k==="all"?"Semua":k==="income"?"Masuk":"Keluar"}</button>)}</div></div>{visible.length?visible.map(t=><div className="transaction" key={t.id}><div className={"symbol "+t.kind}>{t.kind==="income"?"↙":t.category==="Makanan"?"☕":t.category==="Transportasi"?"P":"↗"}</div><div className="tx-info"><b>{t.title}</b><small>{t.category} · {new Date(t.date+"T12:00:00").toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"})}</small></div><strong className={"amount "+(t.kind==="income"?"green":"red")}>{t.kind==="income"?"+":"−"}{fmt(t.amount)}</strong><div className="actions"><button onClick={()=>setEditing({...t})}>Edit</button><button onClick={()=>{if(confirm("Hapus transaksi ini?"))void remove(t.id);}}>Hapus</button></div></div>):<div className="empty"><b>Belum ada transaksi</b>Catat transaksi pertamamu di atas.</div>}</section>
      <footer>CatatKu · Data tersimpan di database akunmu.</footer>
    </section>
    {scannerOpen&&<ReceiptScanner user={user} onClose={()=>setScannerOpen(false)} onSaved={tx=>setTransactions(prev=>[{...tx},...prev])}/>}\n    {editing&&<div className="modal" onClick={()=>setEditing(null)}><form className="edit-form" onSubmit={saveEdit} onClick={e=>e.stopPropagation()}><div className="edit-head"><h3>Edit transaksi</h3><button type="button" onClick={()=>setEditing(null)}>×</button></div><label>Nama transaksi<input value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})} required/></label><label>Nominal<input type="number" min="1" value={editing.amount} onChange={e=>setEditing({...editing,amount:Number(e.target.value)})} required/></label><label>Jenis<select value={editing.kind} onChange={e=>setEditing({...editing,kind:e.target.value as Kind})}><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option></select></label><label>Kategori<input value={editing.category} onChange={e=>setEditing({...editing,category:e.target.value})} required/></label><label>Tanggal<input type="date" value={editing.date} onChange={e=>setEditing({...editing,date:e.target.value})} required/></label><button className="primary">Simpan perubahan</button></form></div>}
  </main>;
}
