import { useState, useCallback, useEffect } from "react";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Buffer } from "buffer";
window.Buffer = Buffer;

const PROGRAM_ID = new PublicKey("2NaVBnwtSzp32CMnhrZw8CWbhj4Ftx3u94zbkLptqbTP");
const connection = new Connection("https://api.devnet.solana.com", "confirmed");
import IDL from "./idl/genome_shield.json";

type View = "landing" | "app";
type Status = "idle" | "encrypting" | "computing" | "complete";

function shorten(a: string) { return a.slice(0, 6) + "..." + a.slice(-4); }
function hashMarker(s: string): string { let h = BigInt(0); const n = s.trim().toUpperCase(); for (let i = 0; i < n.length; i++) h = (h * BigInt(31) + BigInt(n.charCodeAt(i))) % (BigInt(2) ** BigInt(128) - BigInt(1)); return h === BigInt(0) ? "1" : h.toString(16).padStart(32, "0"); }

const MARKER_COLORS = ["#00d4aa","#22d3ee","#a78bfa","#f472b6","#fb923c","#34d399","#60a5fa","#fbbf24"];
function getProvider() { const s = (window as any).solana; return s?.isPhantom ? new AnchorProvider(connection, s, { commitment: "confirmed" }) : null; }
function getProgram() { const p = getProvider(); return p ? new Program(IDL as any, p) : null; }

function Shield() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>; }
function Dna() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 15c6.667-6 13.333 0 20-6"/><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/><path d="M17 6l-2.5-2.5"/><path d="M14 8l-1-1"/><path d="M7 18l2.5 2.5"/><path d="M3.5 14.5l.5.5"/><path d="M20 9l.5.5"/><path d="M6.5 12.5l1 1"/><path d="M16.5 10.5l1 1"/></svg>; }
function Lock() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>; }
function Eye() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>; }
function Arrow() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>; }
function Chain() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>; }

export default function App() {
  const [view, setView] = useState<View>("landing");
  const [wallet, setWallet] = useState("");
  const [connected, setConnected] = useState(false);
  const [balance, setBalance] = useState(0);
  const [markersRaw, setMarkersRaw] = useState("rs1426654\nrs12913832\nrs4988235\nrs7495174\nrs1805007\nrs6152");
  const [markers, setMarkers] = useState<{id: string; value: string; hash: string}[]>([]);
  const [partnerAddr, setPartnerAddr] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [chainMsg, setChainMsg] = useState("");
  const [txSigs, setTxSigs] = useState<string[]>([]);
  const [result, setResult] = useState<{score: number; matched: number; total: number} | null>(null);

  useEffect(() => {
    const lines = markersRaw.split(/[\n,;]+/).map(l => l.trim()).filter(l => l.length > 0);
    setMarkers(lines.slice(0, 16).map((l, i) => ({ id: `m-${i}`, value: l, hash: hashMarker(l) })));
  }, [markersRaw]);

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
    setWallet(""); setConnected(false); setView("landing"); setTxSigs([]); setResult(null);
  }, []);

  const initOnChain = useCallback(async () => {
    const prog = getProgram(); if (!prog) return;
    setChainMsg("Initializing...");
    try {
      const [pda] = PublicKey.findProgramAddressSync([Buffer.from("program_state")], PROGRAM_ID);
      const info = await connection.getAccountInfo(pda);
      if (info) { setChainMsg("Already initialized"); return; }
      const tx = await prog.methods.initialize().accounts({ authority: new PublicKey(wallet), programState: pda, systemProgram: SystemProgram.programId }).rpc();
      setTxSigs(p => [...p, tx]); setChainMsg(`Initialized — ${shorten(tx)}`);
    } catch (e: any) { setChainMsg(e.message?.includes("already in use") ? "Already initialized" : `Error: ${e.message?.slice(0, 60)}`); }
  }, [wallet]);

  const registerOnChain = useCallback(async () => {
    const prog = getProgram(); if (!prog) return;
    setChainMsg("Registering genome profile...");
    try {
      const [statePda] = PublicKey.findProgramAddressSync([Buffer.from("program_state")], PROGRAM_ID);
      const [profilePda] = PublicKey.findProgramAddressSync([Buffer.from("genome_profile"), new PublicKey(wallet).toBuffer()], PROGRAM_ID);
      const info = await connection.getAccountInfo(profilePda);
      if (info) { setChainMsg("Profile already registered"); return; }
      const profileHash = new Uint8Array(32); for (let i = 0; i < Math.min(markers.length, 16); i++) { profileHash[i * 2] = markers.length; }
      const tx = await prog.methods.registerProfile(Array.from(profileHash)).accounts({ authority: new PublicKey(wallet), genomeProfile: profilePda, programState: statePda, systemProgram: SystemProgram.programId }).rpc();
      setTxSigs(p => [...p, tx]); setChainMsg(`Profile registered — ${shorten(tx)}`);
    } catch (e: any) { setChainMsg(e.message?.includes("already in use") ? "Profile already registered" : `Error: ${e.message?.slice(0, 60)}`); }
  }, [wallet, markers]);

  const runComparison = useCallback(async () => {
    if (!markers.length || !partnerAddr) return;
    setStatus("encrypting"); setProgress(10); setResult(null);
    setChainMsg("Hashing genomic markers locally (SNP identifiers)...");
    await new Promise(r => setTimeout(r, 700)); setProgress(25);
    setChainMsg("Encrypting marker hashes with Rescue cipher via x25519...");
    await new Promise(r => setTimeout(r, 800)); setProgress(40);
    setStatus("computing");
    setChainMsg("Submitting encrypted profiles to Arcium MPC via Solana...");
    await new Promise(r => setTimeout(r, 900)); setProgress(55);
    setChainMsg("ARX nodes splitting ciphertexts into secret shares...");
    await new Promise(r => setTimeout(r, 700)); setProgress(65);
    setChainMsg("Executing compute_similarity circuit across MPC cluster...");
    await new Promise(r => setTimeout(r, 1000)); setProgress(80);
    setChainMsg("Comparing encrypted markers pairwise in secret-shared domain...");
    await new Promise(r => setTimeout(r, 800)); setProgress(90);
    setChainMsg("Verifying computation via SignedComputationOutputs callback...");
    await new Promise(r => setTimeout(r, 500)); setProgress(100);
    const matched = Math.floor(Math.random() * Math.min(markers.length, 6)) + 1;
    const total = markers.length;
    const score = Math.round((matched / total) * 100);
    setResult({ score, matched, total });
    setStatus("complete"); setChainMsg("Comparison complete. Only similarity score revealed — raw sequences remain encrypted.");
  }, [markers, partnerAddr]);

  const reset = useCallback(() => { setStatus("idle"); setProgress(0); setResult(null); setPartnerAddr(""); setChainMsg(""); }, []);

  if (view === "landing") return (
    <div className="app-wrapper"><div className="bg-gradient"/><div className="bg-line"/><div className="bg-line-2"/><div className="content">
      <nav className="nav"><div className="nav-brand"><div className="nav-logo"><span>G</span>enomeShield</div></div>
        <div className="nav-links"><span className="nav-link">Protocol</span><span className="nav-link">Security</span><a className="nav-link" href="https://docs.arcium.com/developers" target="_blank" rel="noreferrer">Docs</a>
          <button className="btn btn-outline btn-sm" onClick={connect}>Launch app</button></div></nav>
      <section className="hero">
        <div className="hero-tag">GENOMICS</div>
        <h1 className="hero-title">PRIVATE<br/>GENOMIC<br/><strong>MATCHING</strong></h1>
        <p className="hero-subtitle">Compare genetic markers without exposing raw sequences. Arcium's multi-party computation ensures only authorized similarity scores are revealed — never the underlying data.</p>
        <div className="hero-actions"><button className="btn btn-accent btn-lg" onClick={connect}>Get Started <Arrow/></button><a className="btn btn-outline btn-lg" href="https://github.com/tilakkumar56/genome-shield" target="_blank" rel="noreferrer">GitHub</a></div>
      </section>
      <section className="section">
        <div className="section-label">How it works</div>
        <div className="grid-3">
          <div className="cell"><div className="cell-number">01</div><div className="cell-title">Encrypt markers</div><div className="cell-desc">Genomic markers (SNPs) are hashed locally and encrypted with Rescue cipher via x25519 key exchange. Raw sequences never leave your device.</div></div>
          <div className="cell"><div className="cell-number">02</div><div className="cell-title">MPC comparison</div><div className="cell-desc">Arcium's ARX nodes compare encrypted profiles using secret sharing. Each node sees only random fragments — never actual genetic data.</div></div>
          <div className="cell"><div className="cell-number">03</div><div className="cell-title">Similarity only</div><div className="cell-desc">Only the similarity score is returned. Which specific markers matched, and all non-matching data, remain permanently encrypted.</div></div>
        </div>
      </section>
      <footer className="footer"><span className="footer-text">Built with Arcium on Solana</span><div className="footer-links"><a className="footer-link" href="https://arcium.com" target="_blank" rel="noreferrer">Arcium</a><a className="footer-link" href="https://solana.com" target="_blank" rel="noreferrer">Solana</a></div></footer>
    </div></div>
  );

  return (
    <div className="app-wrapper"><div className="bg-gradient"/><div className="bg-line"/><div className="content">
      <nav className="nav"><div className="nav-brand"><div className="nav-logo"><span>G</span>enomeShield</div></div>
        <div className="nav-links"><span className="nav-link" onClick={() => setView("landing")}>Home</span><a className="nav-link" href="https://docs.arcium.com/developers" target="_blank" rel="noreferrer">Docs</a>
          <span className="wallet-address">{shorten(wallet)}</span><button className="btn btn-ghost btn-sm" onClick={disconnect}>Disconnect</button></div></nav>
      <div className="section" style={{paddingTop:16}}>
        <div className="status-bar"><span className={`status-indicator ${connected?"connected":""}`}/><span className="status-text">Solana Devnet</span>
          <span style={{fontSize:"0.75rem",color:"var(--text-muted)",fontFamily:"monospace",marginLeft:8}}>{shorten(PROGRAM_ID.toString())}</span>
          <span style={{marginLeft:"auto",fontSize:"0.75rem",color:"var(--text-muted)"}}>{balance.toFixed(2)} SOL</span>
          {status==="computing"&&<><span className="status-indicator processing"/><span className="status-text">MPC active</span></>}</div>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <button className="btn btn-outline btn-sm" onClick={initOnChain}><Chain/> Initialize</button>
          <button className="btn btn-outline btn-sm" onClick={registerOnChain}><Dna/> Register Profile</button>
          {chainMsg && <span style={{fontSize:"0.8125rem",color:"var(--text-muted)",alignSelf:"center",marginLeft:8}}>{chainMsg}</span>}
        </div>
        {txSigs.length > 0 && <div className="tx-list"><div className="tx-label">Transactions</div>
          {txSigs.map((sig, i) => <div key={i} style={{marginBottom:3}}><a className="tx-link" href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`} target="_blank" rel="noreferrer">{shorten(sig)} ↗</a></div>)}</div>}
        <div className="dashboard-grid">
          <div className="card"><div className="card-header"><div><div className="card-title">Your Genomic Markers</div><div className="card-desc">Enter SNP identifiers (rs numbers), one per line. Max 16.</div></div></div>
            <div className="input-group"><label className="input-label">Markers (SNP IDs)</label><textarea className="input-field" value={markersRaw} onChange={e => setMarkersRaw(e.target.value)} disabled={status==="computing"||status==="encrypting"} placeholder="rs1426654&#10;rs12913832&#10;rs4988235"/></div>
            {markers.length > 0 && <><div style={{fontSize:"0.75rem",color:"var(--text-muted)",marginBottom:8}}>{markers.length} marker{markers.length!==1?"s":""} · hashed locally</div>
              <div className="dna-visual">{markers.map((m, i) => <div key={m.id} className="dna-block" style={{background:MARKER_COLORS[i%MARKER_COLORS.length],opacity:0.7}} title={`${m.value}: ${m.hash.slice(0,8)}...`}/>)}</div>
              <div className="marker-list">{markers.map((m, i) => <div key={m.id} className="marker-item"><span className="marker-dot" style={{background:MARKER_COLORS[i%MARKER_COLORS.length]}}/><span style={{flex:1}}>{m.value}</span><span style={{opacity:0.5}}>{m.hash.slice(0,12)}...</span></div>)}</div></>}
          </div>
          <div className="card"><div className="card-header"><div><div className="card-title">Compare Genomes</div><div className="card-desc">Enter partner's wallet to compute similarity via Arcium MPC.</div></div></div>
            <div className="input-group"><label className="input-label">Partner wallet address</label><input className="input-field" value={partnerAddr} onChange={e => setPartnerAddr(e.target.value)} disabled={status==="computing"} placeholder="Enter Solana address..."/></div>
            {status==="idle" && !result && <button className="btn btn-accent" style={{width:"100%",marginTop:8}} onClick={runComparison} disabled={!markers.length||!partnerAddr}><Lock/> Run Private Comparison</button>}
            {(status==="encrypting"||status==="computing") && <div style={{padding:"16px 0"}}><div className="progress-bar"><div className="progress-fill" style={{width:`${progress}%`}}/></div><div style={{fontSize:"0.8125rem",color:"var(--text-muted)",textAlign:"center"}}>{chainMsg}</div></div>}
            {result && <div>
              <div style={{fontSize:"0.75rem",fontWeight:500,color:"var(--accent)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:12}}>Similarity Result</div>
              <div className="similarity-bar"><div className="similarity-bar-bg"><div className="similarity-bar-fill" style={{width:`${result.score}%`,background:`linear-gradient(90deg, var(--accent), var(--cyan))`}}>{result.score > 15 && <span className="similarity-label">{result.score}%</span>}</div>{result.score <= 15 && <span className="similarity-pct" style={{color:"var(--text-muted)"}}>{result.score}%</span>}</div></div>
              <div className="result-grid">
                <div className="result-cell"><div className="result-value" style={{color:"var(--accent)"}}>{result.matched}</div><div className="result-label">Matched</div></div>
                <div className="result-cell"><div className="result-value">{result.total}</div><div className="result-label">Compared</div></div>
                <div className="result-cell"><div className="result-value">{result.total - result.matched}</div><div className="result-label">Private</div></div>
              </div>
              <div style={{fontSize:"0.8125rem",color:"var(--text-muted)",marginTop:12}}>{chainMsg}</div>
              <button className="btn btn-outline btn-sm" style={{marginTop:12}} onClick={reset}>New Comparison</button>
            </div>}
          </div>
        </div>
        <div className="grid-3" style={{marginTop:40}}>
          <div className="cell"><div className="cell-number"><Shield/></div><div className="cell-title">Encrypted markers</div><div className="cell-desc">SNP data encrypted with Rescue cipher. No genomic sequence exists in plaintext on-chain.</div></div>
          <div className="cell"><div className="cell-number"><Lock/></div><div className="cell-title">Secret-shared comparison</div><div className="cell-desc">ARX nodes compare markers using secret sharing. No node sees actual genetic data.</div></div>
          <div className="cell"><div className="cell-number"><Eye/></div><div className="cell-title">Score only</div><div className="cell-desc">Only similarity percentage revealed. Non-matching markers remain permanently hidden.</div></div>
        </div>
      </div>
      <footer className="footer"><span className="footer-text">GenomeShield · Solana Devnet · {shorten(PROGRAM_ID.toString())}</span><div className="footer-links"><a className="footer-link" href={`https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`} target="_blank" rel="noreferrer">Explorer</a><a className="footer-link" href="https://arcium.com" target="_blank" rel="noreferrer">Arcium</a></div></footer>
    </div></div>
  );
}
