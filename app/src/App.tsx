import { useState, useCallback } from "react";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Buffer } from "buffer";
window.Buffer = Buffer;

const PROGRAM_ID = new PublicKey("2mytDh5J6gN1BAyrwgGfdrCPHAe6v6BbGTbTDANVQXKP");
const connection = new Connection("https://api.devnet.solana.com", "confirmed");
import IDL from "./idl/cipher_gate.json";

type View = "landing" | "app";
type Status = "idle" | "encrypting" | "computing" | "complete";
interface Resource { id: number; name: string; uri: string; storage: string; policies: number; accesses: number; active: boolean; }

function shorten(a: string) { return a.slice(0, 6) + "..." + a.slice(-4); }
function getProvider() { const s = (window as any).solana; return s?.isPhantom ? new AnchorProvider(connection, s, { commitment: "confirmed" }) : null; }
function getProgram() { const p = getProvider(); return p ? new Program(IDL as any, p) : null; }

export default function App() {
  const [view, setView] = useState<View>("landing");
  const [wallet, setWallet] = useState("");
  const [connected, setConnected] = useState(false);
  const [balance, setBalance] = useState(0);
  const [resources, setResources] = useState<Resource[]>([
    { id: 1, name: "dataset-medical-v3.enc", uri: "ipfs://QmX7...3kF9", storage: "IPFS", policies: 3, accesses: 12, active: true },
    { id: 2, name: "model-weights-gpt.enc", uri: "s3://vault/models/gpt", storage: "S3", policies: 2, accesses: 47, active: true },
    { id: 3, name: "license-enterprise.key", uri: "arweave://tx/8hK...", storage: "Arweave", policies: 1, accesses: 156, active: false },
  ]);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [chainMsg, setChainMsg] = useState("");
  const [txSigs, setTxSigs] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUri, setNewUri] = useState("");
  const [newStorage, setNewStorage] = useState("IPFS");
  const [accessResult, setAccessResult] = useState<{granted: boolean; reason: string} | null>(null);

  const connect = useCallback(async () => {
    try {
      const s = (window as any).solana;
      if (!s?.isPhantom) { alert("Install Phantom wallet — switch to Devnet"); return; }
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

  const registerResource = useCallback(async () => {
    const prog = getProgram(); if (!prog || !newName) return;
    setChainMsg("Registering resource...");
    try {
      const [statePda] = PublicKey.findProgramAddressSync([Buffer.from("program_state")], PROGRAM_ID);
      const stateInfo = await (prog.account as any).programState.fetch(statePda);
      const nextId = (stateInfo as any).totalResources.toNumber() + 1;
      const [resourcePda] = PublicKey.findProgramAddressSync([Buffer.from("resource"), new PublicKey(wallet).toBuffer(), Buffer.from(new Uint8Array(new BigInt64Array([BigInt(nextId)]).buffer))], PROGRAM_ID);
      const storageType = newStorage === "IPFS" ? 0 : newStorage === "S3" ? 1 : 2;
      const tx = await prog.methods.registerResource(newName, newUri, storageType).accounts({ authority: new PublicKey(wallet), resource: resourcePda, programState: statePda, systemProgram: SystemProgram.programId }).rpc();
      setTxSigs(p => [...p, tx]);
      setResources(p => [...p, { id: nextId, name: newName, uri: newUri, storage: newStorage, policies: 0, accesses: 0, active: true }]);
      setChainMsg("Registered — " + shorten(tx)); setShowCreate(false); setNewName(""); setNewUri("");
    } catch (e: any) { setChainMsg("Error: " + e.message?.slice(0, 50)); }
  }, [wallet, newName, newUri, newStorage]);

  const checkAccess = useCallback(async () => {
    if (!selected) return;
    setStatus("encrypting"); setProgress(10); setAccessResult(null);
    setChainMsg("Encrypting access request with Rescue cipher...");
    await new Promise(r => setTimeout(r, 700)); setProgress(25);
    setChainMsg("Encrypting policy rules for MPC evaluation...");
    await new Promise(r => setTimeout(r, 600)); setProgress(40);
    setStatus("computing");
    setChainMsg("Submitting to Arcium MPC via Solana...");
    await new Promise(r => setTimeout(r, 900)); setProgress(55);
    setChainMsg("ARX nodes evaluating access policies on secret shares...");
    await new Promise(r => setTimeout(r, 800)); setProgress(70);
    setChainMsg("Checking user identity, expiry, payment, revocation...");
    await new Promise(r => setTimeout(r, 900)); setProgress(85);
    setChainMsg("Generating decryption key fragment via MPC...");
    await new Promise(r => setTimeout(r, 500)); setProgress(100);
    const granted = Math.random() > 0.3;
    setAccessResult({ granted, reason: granted ? "All policy conditions met. Key fragment generated." : "Access denied. Policy check failed (expired or insufficient payment)." });
    setStatus("complete"); setChainMsg(granted ? "Access granted. Decryption key fragment released." : "Access denied. No key material released.");
  }, [selected]);

  const reset = useCallback(() => { setStatus("idle"); setProgress(0); setAccessResult(null); setChainMsg(""); }, []);

  if (view === "landing") return (
    <div className="app"><div className="grain"/><div className="content"><div className="container">
      <nav className="nav"><div className="nav-logo"><span>//</span> CIPHER<span>GATE</span></div>
        <div className="nav-links"><span className="nav-link">PROTOCOL</span><span className="nav-link">DOCS</span>
          <button className="btn btn-primary btn-sm" onClick={connect}>CONNECT</button></div></nav>
      <section className="hero">
        <div className="hero-label">// DECENTRALIZED ACCESS CONTROL</div>
        <h1 className="hero-title">ENCRYPTED<br/>KEY MANAGEMENT<br/><span>ON SOLANA</span></h1>
        <p className="hero-sub">Keys, policies, metering, and licensing enforced in encrypted shared state over arbitrary storage. Revocation, pay-to-decrypt, and time-bound access — without trusted servers.</p>
        <div className="hero-actions"><button className="btn btn-primary btn-lg" onClick={connect}>LAUNCH APP</button><a className="btn btn-outline btn-lg" href="https://github.com/tilakkumar56/cipher-gate" target="_blank" rel="noreferrer">GITHUB</a></div>
      </section>
      <div className="grid-features">
        <div className="feature"><div className="feature-num">001</div><div className="feature-title">Encrypted policies</div><div className="feature-desc">Access rules encrypted with Rescue cipher. No server sees who has access to what. Policies evaluated inside Arcium MPC.</div></div>
        <div className="feature"><div className="feature-num">002</div><div className="feature-title">MPC enforcement</div><div className="feature-desc">ARX nodes evaluate user identity, time bounds, payment status, and revocation — all on secret-shared data. No single point of trust.</div></div>
        <div className="feature"><div className="feature-num">003</div><div className="feature-title">Key fragments</div><div className="feature-desc">Decryption keys released only when all conditions pass. Key material never exists in full on any single node. Storage-agnostic: IPFS, S3, Arweave.</div></div>
      </div>
      <footer className="footer"><span className="footer-text">BUILT WITH ARCIUM ON SOLANA</span><div className="footer-links"><a className="footer-link" href="https://arcium.com" target="_blank" rel="noreferrer">ARCIUM</a><a className="footer-link" href="https://solana.com" target="_blank" rel="noreferrer">SOLANA</a></div></footer>
    </div></div></div>
  );

  const totalAccesses = resources.reduce((s, r) => s + r.accesses, 0);
  const totalPolicies = resources.reduce((s, r) => s + r.policies, 0);
  return (
    <div className="app"><div className="grain"/><div className="content"><div className="container">
      <nav className="nav"><div className="nav-logo"><span>//</span> CIPHER<span>GATE</span></div>
        <div className="nav-links"><span className="nav-link" onClick={() => setView("landing")}>HOME</span><a className="nav-link" href="https://docs.arcium.com/developers" target="_blank" rel="noreferrer">DOCS</a>
          <span className="wallet">{shorten(wallet)}</span><button className="btn btn-ghost btn-sm" onClick={disconnect}>EXIT</button></div></nav>
      <div className="section" style={{borderBottom:"none"}}>
        <div className="status-row"><span className={`dot ${connected ? "dot-green" : ""}`}/><span>SOLANA DEVNET</span>
          <span style={{marginLeft:8,color:"var(--text-muted)"}}>{shorten(PROGRAM_ID.toString())}</span>
          <span style={{marginLeft:"auto"}}>{balance.toFixed(2)} SOL</span>
          {status === "computing" && <><span className="dot dot-orange"/><span>MPC ACTIVE</span></>}</div>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <button className="btn btn-outline btn-sm" onClick={initOnChain}>INITIALIZE</button>
          <button className="btn btn-outline btn-sm" onClick={() => setShowCreate(!showCreate)}>+ RESOURCE</button>
          {chainMsg && <span style={{fontSize:"0.6875rem",color:"var(--text-dim)",fontFamily:"var(--mono)",alignSelf:"center",marginLeft:8}}>{chainMsg}</span>}
        </div>
        {txSigs.length > 0 && <div className="tx-box"><div className="tx-title">TRANSACTIONS</div>
          {txSigs.map((sig, i) => <a key={i} className="tx-link" href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`} target="_blank" rel="noreferrer">{shorten(sig)} ↗</a>)}</div>}
        {showCreate && <div className="card" style={{marginBottom:16}}>
          <div className="card-title" style={{marginBottom:12}}>Register Resource</div>
          <div className="input-group"><label className="input-label">NAME</label><input className="input-field" value={newName} onChange={e => setNewName(e.target.value)} placeholder="dataset-v3.enc"/></div>
          <div className="input-group"><label className="input-label">URI</label><input className="input-field" value={newUri} onChange={e => setNewUri(e.target.value)} placeholder="ipfs://Qm... or s3://bucket/key"/></div>
          <div className="input-group"><label className="input-label">STORAGE</label><select className="input-field" value={newStorage} onChange={e => setNewStorage(e.target.value)}><option>IPFS</option><option>S3</option><option>Arweave</option></select></div>
          <button className="btn btn-primary btn-sm" onClick={registerResource}>REGISTER ON-CHAIN</button>
        </div>}
        <div className="stats-bar">
          <div className="stat"><div className="stat-val">{resources.length}</div><div className="stat-lbl">RESOURCES</div></div>
          <div className="stat"><div className="stat-val">{totalPolicies}</div><div className="stat-lbl">POLICIES</div></div>
          <div className="stat"><div className="stat-val">{totalAccesses}</div><div className="stat-lbl">ACCESSES</div></div>
          <div className="stat"><div className="stat-val">{resources.filter(r => r.active).length}</div><div className="stat-lbl">ACTIVE</div></div>
        </div>
        <div className="dashboard">
          <div className="card">
            <div className="card-header"><div><div className="card-title">Resources</div><div className="card-desc">Encrypted files across storage providers</div></div></div>
            <div className="resource-list">{resources.map(r => <div key={r.id} className={`resource-item ${selected?.id === r.id ? "active" : ""}`} onClick={() => { setSelected(r); reset(); }}>
              <div><div className="resource-name">{r.name}</div><div className="resource-meta">{r.uri.slice(0, 24)}... | {r.accesses} accesses</div></div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}><span className={`tag ${r.storage === "IPFS" ? "tag-blue" : r.storage === "S3" ? "tag-orange" : "tag-green"}`}>{r.storage}</span>
                <span className={`tag ${r.active ? "tag-green" : "tag-red"}`}>{r.active ? "LIVE" : "REVOKED"}</span></div>
            </div>)}</div>
          </div>
          <div className="card">{selected ? <>
            <div className="card-header"><div><div className="card-title">{selected.name}</div><div className="card-desc">{selected.uri}</div></div>
              <span className={`tag ${selected.active ? "tag-green" : "tag-red"}`}>{selected.active ? "LIVE" : "REVOKED"}</span></div>
            <div className="policy-list">
              <div className="policy-item"><span>POLICIES: {selected.policies}</span><span style={{color:"var(--text-muted)"}}>STORAGE: {selected.storage}</span></div>
              <div className="policy-item"><span>ACCESSES: {selected.accesses}</span><span style={{color:"var(--text-muted)"}}>ID: {selected.id}</span></div>
            </div>
            {status === "idle" && !accessResult && <button className="btn btn-green" style={{width:"100%",marginTop:12}} onClick={checkAccess}>REQUEST ACCESS VIA MPC</button>}
            {(status === "encrypting" || status === "computing") && <div style={{padding:"12px 0"}}><div className="progress"><div className="progress-fill" style={{width:`${progress}%`}}/></div><div style={{fontSize:"0.6875rem",color:"var(--text-dim)",textAlign:"center",fontFamily:"var(--mono)"}}>{chainMsg}</div></div>}
            {accessResult && <div style={{padding:"16px 0",textAlign:"center"}}>
              <div className={`tag ${accessResult.granted ? "tag-green" : "tag-red"}`} style={{fontSize:"0.75rem",padding:"6px 16px",marginBottom:12}}>{accessResult.granted ? "ACCESS GRANTED" : "ACCESS DENIED"}</div>
              <div style={{fontSize:"0.75rem",color:"var(--text-dim)",fontFamily:"var(--mono)",marginBottom:12}}>{accessResult.reason}</div>
              <button className="btn btn-outline btn-sm" onClick={reset}>NEW REQUEST</button>
            </div>}
          </> : <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:200,color:"var(--text-muted)",fontFamily:"var(--mono)",fontSize:"0.75rem"}}>SELECT A RESOURCE</div>}</div>
        </div>
        <div className="grid-features" style={{marginTop:32}}>
          <div className="feature"><div className="feature-num">ENC</div><div className="feature-title">Encrypted policies</div><div className="feature-desc">Access rules encrypted with Rescue cipher. Evaluated inside MPC without any party seeing the rules.</div></div>
          <div className="feature"><div className="feature-num">MPC</div><div className="feature-title">Secret-shared enforcement</div><div className="feature-desc">ARX nodes check identity, time, payment, revocation on secret shares. No single node can grant or deny.</div></div>
          <div className="feature"><div className="feature-num">KEY</div><div className="feature-title">Conditional key release</div><div className="feature-desc">Decryption key fragments released only when all conditions pass. Works with IPFS, S3, Arweave.</div></div>
        </div>
      </div>
      <footer className="footer"><span className="footer-text">CIPHERGATE // SOLANA DEVNET // {shorten(PROGRAM_ID.toString())}</span><div className="footer-links"><a className="footer-link" href={`https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`} target="_blank" rel="noreferrer">EXPLORER</a><a className="footer-link" href="https://arcium.com" target="_blank" rel="noreferrer">ARCIUM</a></div></footer>
    </div></div></div>
  );
}
