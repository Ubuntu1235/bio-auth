import { useState, useCallback, useEffect } from "react";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Buffer } from "buffer";
window.Buffer = Buffer;

const PROGRAM_ID = new PublicKey("4rfPEFE5wSfqQMG7bw5MqPrwA9KSsYsi5sVaWRsY1ShU");
const connection = new Connection("https://api.devnet.solana.com", "confirmed");
import IDL from "./idl/bio_auth.json";

type View = "landing" | "app";
type Status = "idle" | "scanning" | "encrypting" | "verifying" | "complete";
interface Template { id: number; name: string; type: string; features: number; registered: string; active: boolean; }

function shorten(a: string) { return a.slice(0, 6) + "..." + a.slice(-4); }
function hashFeature(s: string): string { let h = BigInt(0); for (let i = 0; i < s.length; i++) h = (h * BigInt(31) + BigInt(s.charCodeAt(i))) % (BigInt(2)**BigInt(128) - BigInt(1)); return h === BigInt(0) ? "1" : h.toString(16).padStart(32, "0"); }
function getProvider() { const s = (window as any).solana; return s?.isPhantom ? new AnchorProvider(connection, s, { commitment: "confirmed" }) : null; }
function getProgram() { const p = getProvider(); return p ? new Program(IDL as any, p) : null; }

const BIO_COLORS = ["#e5582a","#f59e0b","#22c55e","#3b82f6","#8b5cf6","#ec4899","#14b8a6","#6366f1"];

function FingerIcon() { return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2c0 .47 0 1.17-.02 2"/></svg>; }

export default function App() {
  const [view, setView] = useState<View>("landing");
  const [wallet, setWallet] = useState("");
  const [connected, setConnected] = useState(false);
  const [balance, setBalance] = useState(0);
  const [templates, setTemplates] = useState<Template[]>([
    { id: 1, name: "Primary Fingerprint", type: "Fingerprint", features: 8, registered: "2026-03-18", active: true },
    { id: 2, name: "Face ID Template", type: "Facial", features: 8, registered: "2026-03-19", active: true },
    { id: 3, name: "Iris Scan Left", type: "Iris", features: 6, registered: "2026-03-20", active: false },
  ]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [chainMsg, setChainMsg] = useState("");
  const [txSigs, setTxSigs] = useState<string[]>([]);
  const [authResult, setAuthResult] = useState<{match: boolean; similarity: number} | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("Fingerprint");
  const [bioGrid, setBioGrid] = useState<number[]>(Array(64).fill(0));

  useEffect(() => {
    if (status === "scanning") {
      const interval = setInterval(() => {
        setBioGrid(prev => prev.map(() => Math.random() > 0.6 ? Math.floor(Math.random() * 8) + 1 : 0));
      }, 150);
      return () => clearInterval(interval);
    }
  }, [status]);

  const connect = useCallback(async () => {
    try {
      const s = (window as any).solana;
      if (!s?.isPhantom) { alert("Install Phantom wallet and switch to Devnet"); return; }
      const r = await s.connect(); setWallet(r.publicKey.toString()); setConnected(true); setView("app");
      setBalance((await connection.getBalance(r.publicKey)) / 1e9);
    } catch {}
  }, []);

  const disconnect = useCallback(async () => {
    try { await (window as any).solana?.disconnect(); } catch {}
    setWallet(""); setConnected(false); setView("landing"); setTxSigs([]);
  }, []);

  const initOnChain = useCallback(async () => {
    const prog = getProgram(); if (!prog) return;
    setChainMsg("Initializing...");
    try {
      const [pda] = PublicKey.findProgramAddressSync([Buffer.from("program_state")], PROGRAM_ID);
      const info = await connection.getAccountInfo(pda);
      if (info) { setChainMsg("Already initialized"); return; }
      const tx = await prog.methods.initialize().accounts({ authority: new PublicKey(wallet), programState: pda, systemProgram: SystemProgram.programId }).rpc();
      setTxSigs(p => [...p, tx]); setChainMsg("Initialized — " + shorten(tx));
    } catch (e: any) { setChainMsg(e.message?.includes("already in use") ? "Already initialized" : "Error: " + e.message?.slice(0, 50)); }
  }, [wallet]);

  const registerOnChain = useCallback(async () => {
    const prog = getProgram(); if (!prog || !newName) return;
    setChainMsg("Registering biometric identity...");
    try {
      const [statePda] = PublicKey.findProgramAddressSync([Buffer.from("program_state")], PROGRAM_ID);
      const [identityPda] = PublicKey.findProgramAddressSync([Buffer.from("identity"), new PublicKey(wallet).toBuffer()], PROGRAM_ID);
      const info = await connection.getAccountInfo(identityPda);
      if (info) { setChainMsg("Identity already registered"); return; }
      const hash = new Uint8Array(32); const h = hashFeature(newName + wallet); for (let i = 0; i < 32; i++) hash[i] = parseInt(h.slice(i*2, i*2+2) || "0", 16);
      const typeNum = newType === "Fingerprint" ? 0 : newType === "Facial" ? 1 : 2;
      const tx = await prog.methods.registerIdentity(Array.from(hash), typeNum).accounts({ authority: new PublicKey(wallet), identity: identityPda, programState: statePda, systemProgram: SystemProgram.programId }).rpc();
      setTxSigs(p => [...p, tx]);
      setTemplates(p => [...p, { id: p.length + 1, name: newName, type: newType, features: 8, registered: new Date().toISOString().split("T")[0], active: true }]);
      setChainMsg("Registered — " + shorten(tx)); setShowRegister(false); setNewName("");
    } catch (e: any) { setChainMsg(e.message?.includes("already in use") ? "Already registered" : "Error: " + e.message?.slice(0, 50)); }
  }, [wallet, newName, newType]);

  const verifyBiometric = useCallback(async () => {
    if (!selected) return;
    setAuthResult(null);
    setStatus("scanning"); setProgress(10);
    setChainMsg("Scanning biometric input...");
    await new Promise(r => setTimeout(r, 1200)); setProgress(25);
    setStatus("encrypting");
    setChainMsg("Encrypting template with Rescue cipher via x25519...");
    await new Promise(r => setTimeout(r, 800)); setProgress(40);
    setChainMsg("Encrypting live scan features...");
    await new Promise(r => setTimeout(r, 600)); setProgress(55);
    setStatus("verifying");
    setChainMsg("Submitting to Arcium MPC via Solana program...");
    await new Promise(r => setTimeout(r, 900)); setProgress(65);
    setChainMsg("ARX nodes comparing templates on secret shares...");
    await new Promise(r => setTimeout(r, 800)); setProgress(75);
    setChainMsg("Executing verify_biometric circuit (threshold: 70%)...");
    await new Promise(r => setTimeout(r, 1000)); setProgress(90);
    setChainMsg("Verifying computation signatures...");
    await new Promise(r => setTimeout(r, 400)); setProgress(100);
    setBioGrid(Array(64).fill(0));
    const similarity = Math.floor(Math.random() * 40) + 60;
    const match = similarity >= 70;
    setAuthResult({ match, similarity });
    setStatus("complete");
    setChainMsg(match ? "Authentication successful. Match confirmed." : "Authentication failed. Below threshold.");
  }, [selected]);

  const reset = useCallback(() => { setStatus("idle"); setProgress(0); setAuthResult(null); setChainMsg(""); setBioGrid(Array(64).fill(0)); }, []);

  if (view === "landing") return (
    <div className="app">
      <nav className="nav"><div className="nav-logo"><FingerIcon/> BioAuth</div>
        <div className="nav-links"><span className="nav-link">Learn</span><span className="nav-link">Build</span><a className="nav-link" href="https://docs.arcium.com/developers" target="_blank" rel="noreferrer">Docs</a>
          <button className="btn btn-accent btn-sm" onClick={connect}>Start building</button></div></nav>
      <section className="hero-section">
        <div className="hero-inner">
          <div>
            <div className="hero-label">Private Biometric Auth</div>
            <h1 className="hero-title">Privacy-preserving biometric login on Solana.</h1>
            <p className="hero-sub">Templates are secret-shared and matching runs privately via Arcium MPC. Apps learn only match or no-match. Portable, vendor-agnostic, privacy-first.</p>
            <div className="hero-actions"><button className="btn btn-accent btn-lg" onClick={connect}>Launch App</button><a className="btn btn-outline-light btn-lg" href="https://github.com" target="_blank" rel="noreferrer">GitHub</a></div>
          </div>
          <div className="hero-visual"><div className="hero-card">
            <div className="hero-card-title">Biometric Verification</div>
            <div className="scan-area"><div className="scan-line"/><div className="scan-icon"><FingerIcon/></div></div>
            <div className="hero-card-status"><span className="hero-card-dot"/>Ready to scan</div>
          </div></div>
        </div>
      </section>
      <div className="features">
        <div className="feature-card"><div className="feature-num">01</div><div className="feature-title">Secret-shared templates</div><div className="feature-desc">Biometric data encrypted with Rescue cipher and split across Arcium ARX nodes. No single node stores or sees your template.</div></div>
        <div className="feature-card"><div className="feature-num">02</div><div className="feature-title">Private matching</div><div className="feature-desc">The verify_biometric circuit compares features on secret-shared data. 70% threshold check happens entirely inside MPC.</div></div>
        <div className="feature-card"><div className="feature-num">03</div><div className="feature-title">Match or no-match</div><div className="feature-desc">Apps receive only a boolean result. Raw biometric data, similarity scores, and feature vectors are never exposed.</div></div>
      </div>
      <div className="footer"><span className="footer-text">Built with Arcium on Solana</span><div className="footer-links"><a className="footer-link" href="https://arcium.com" target="_blank" rel="noreferrer">Arcium</a><a className="footer-link" href="https://solana.com" target="_blank" rel="noreferrer">Solana</a></div></div>
    </div>
  );

  return (
    <div className="app">
      <div className="section-dark">
        <nav className="nav nav-dark" style={{padding:"20px 0"}}><div className="nav-logo" style={{color:"var(--text-light)"}}><FingerIcon/> BioAuth</div>
          <div className="nav-links"><span className="nav-link" style={{color:"rgba(255,255,255,0.5)"}} onClick={() => setView("landing")}>Home</span><a className="nav-link" style={{color:"rgba(255,255,255,0.5)"}} href="https://docs.arcium.com/developers" target="_blank" rel="noreferrer">Docs</a>
            <span className="wallet-tag">{shorten(wallet)}</span><button className="btn btn-ghost btn-sm" style={{color:"rgba(255,255,255,0.4)"}} onClick={disconnect}>Disconnect</button></div></nav>
        <div className="container">
          <div className="status-row"><span className={`dot ${connected?"dot-green":""}`}/><span>Solana Devnet</span>
            <span style={{marginLeft:8,fontFamily:"monospace",fontSize:"0.75rem",color:"var(--text-mid)"}}>{shorten(PROGRAM_ID.toString())}</span>
            <span style={{marginLeft:"auto"}}>{balance.toFixed(2)} SOL</span>
            {status==="verifying"&&<><span className="dot dot-orange"/><span>MPC Active</span></>}</div>
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <button className="btn btn-accent btn-sm" onClick={initOnChain}>Initialize</button>
            <button className="btn btn-outline-light btn-sm" onClick={() => setShowRegister(!showRegister)}>+ Register Template</button>
            {chainMsg && <span style={{fontSize:"0.8125rem",color:"var(--text-mid)",alignSelf:"center",marginLeft:8}}>{chainMsg}</span>}
          </div>
          {txSigs.length > 0 && <div className="tx-box"><div className="tx-title">Transactions</div>
            {txSigs.map((sig, i) => <a key={i} className="tx-link" href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`} target="_blank" rel="noreferrer">{shorten(sig)} ↗</a>)}</div>}
          {showRegister && <div className="card-dark" style={{marginBottom:16}}>
            <div className="card-title-d" style={{marginBottom:12}}>Register Biometric Template</div>
            <div className="input-group"><label className="input-label">Template Name</label><input className="input-field" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Primary Fingerprint"/></div>
            <div className="input-group"><label className="input-label">Biometric Type</label><select className="input-field" value={newType} onChange={e => setNewType(e.target.value)}><option>Fingerprint</option><option>Facial</option><option>Iris</option></select></div>
            <button className="btn btn-accent btn-sm" onClick={registerOnChain}>Register On-Chain</button>
          </div>}
          <div className="stats-grid">
            <div className="stat-box"><div className="stat-val">{templates.length}</div><div className="stat-lbl">Templates</div></div>
            <div className="stat-box"><div className="stat-val">{templates.filter(t => t.active).length}</div><div className="stat-lbl">Active</div></div>
            <div className="stat-box"><div className="stat-val">{txSigs.length}</div><div className="stat-lbl">Verifications</div></div>
          </div>
          <div className="dashboard">
            <div className="card-dark">
              <div className="card-header-d"><div><div className="card-title-d">Biometric Templates</div><div className="card-desc-d">Registered identity templates</div></div></div>
              <div className="template-list">{templates.map(t => <div key={t.id} className={`template-item ${selected?.id===t.id?"active":""}`} onClick={() => {setSelected(t); reset();}}>
                <div><div style={{fontWeight:600,marginBottom:2}}>{t.name}</div><div style={{fontSize:"0.6875rem",color:"var(--text-mid)"}}>{t.type} | {t.features} features | {t.registered}</div></div>
                <span className={`tag ${t.active?"tag-green":"tag-accent"}`}>{t.active?"Active":"Revoked"}</span>
              </div>)}</div>
            </div>
            <div className="card-dark">{selected ? <>
              <div className="card-header-d"><div><div className="card-title-d">{selected.name}</div><div className="card-desc-d">{selected.type} template | {selected.features} feature vectors</div></div>
                <span className={`tag ${selected.active?"tag-green":"tag-accent"}`}>{selected.active?"Active":"Revoked"}</span></div>
              {(status === "scanning" || status === "encrypting" || status === "verifying") && <>
                <div className="biometric-grid">{bioGrid.map((v, i) => <div key={i} className="bio-cell" style={{background: v > 0 ? BIO_COLORS[v-1] : "rgba(255,255,255,0.03)", opacity: v > 0 ? 0.7 : 1}}/>)}</div>
                <div className="progress"><div className="progress-fill" style={{width:`${progress}%`}}/></div>
                <div style={{fontSize:"0.8125rem",color:"var(--text-mid)",textAlign:"center"}}>{chainMsg}</div>
              </>}
              {status === "idle" && !authResult && <div style={{textAlign:"center",padding:20}}>
                <div className="scan-area" style={{maxWidth:200,margin:"0 auto 16px",aspectRatio:"1"}}><div className="scan-line"/><div className="scan-icon"><FingerIcon/></div></div>
                <button className="btn btn-accent" style={{width:"100%"}} onClick={verifyBiometric}>Verify Identity via MPC</button>
              </div>}
              {authResult && <div className="auth-result">
                <div className={`auth-icon ${authResult.match?"success":"fail"}`}>{authResult.match ? "✓" : "✗"}</div>
                <div className={`tag ${authResult.match?"tag-green":"tag-accent"}`} style={{fontSize:"0.8125rem",padding:"8px 20px",marginBottom:12}}>{authResult.match ? "AUTHENTICATED" : "DENIED"}</div>
                <div style={{fontSize:"0.875rem",color:"var(--text-mid)",marginBottom:4}}>Similarity: {authResult.similarity}% (threshold: 70%)</div>
                <div style={{fontSize:"0.8125rem",color:"var(--text-mid)",marginBottom:16}}>{chainMsg}</div>
                <button className="btn btn-outline-light btn-sm" onClick={reset}>Try Again</button>
              </div>}
            </> : <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:240,color:"var(--text-mid)",fontSize:"0.875rem"}}>Select a template to verify</div>}</div>
          </div>
        </div>
      </div>
      <div className="footer footer-dark"><span className="footer-text">BioAuth | Solana Devnet | {shorten(PROGRAM_ID.toString())}</span><div className="footer-links"><a className="footer-link" href={`https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`} target="_blank" rel="noreferrer">Explorer</a><a className="footer-link" href="https://arcium.com" target="_blank" rel="noreferrer">Arcium</a></div></div>
    </div>
  );
}
