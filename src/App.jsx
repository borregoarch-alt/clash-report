import { useState, useRef, useCallback, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ─────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD  = "BIMEdge2025!";
const N8N_WEBHOOK_URL = "http://localhost:5678/webhook/980163d4-deb4-4ead-b19e-acef8832d79a";
const APP_PUBLIC_URL  = "https://borregoarch-alt.github.io/clash-report";

const supabase = createClient(
  "https://agjmyhfwnraaunnflrbz.supabase.co",
  "sb_publishable_z4zsiOwTyFD9PQuIItcqQw_wPHbfHEV"
);

const STORAGE_PROJECTS = "bim_projects_v1";
const STORAGE_REPORT   = id => `bim_report_v2_${id}`;
const STORAGE_COMMENTS = id => `bim_comments_v2_${id}`;
const BUCKET           = "floor-plans";

// ─────────────────────────────────────────────────────────────────
// DESIGN TOKENS — Industrial Precision
// ─────────────────────────────────────────────────────────────────
const C = {
  surface:         "#f8f9ff",
  surfaceLow:      "#eff4ff",
  surfaceLowest:   "#ffffff",
  surfaceHigh:     "#dde9ff",
  surfaceContainer:"#e4ecff",
  surfaceBright:   "#f0f5ff",
  onSurface:       "#0d1c2f",
  onSurfaceMid:    "#3d5168",
  onSurfaceFaint:  "#7a90a8",
  primaryGrad:     "linear-gradient(135deg, #000000 0%, #497cff 100%)",
  onPrimaryFixed:  "#003ea8",
  error:           "#ba1a1a",
  errorContainer:  "#ffdad6",
  onError:         "#410002",
  tertiary:        "#ffdbca",
  onTertiary:      "#5d1900",
  emeraldBg:       "rgba(16,107,65,0.08)",
  emerald:         "#0f6b41",
  outline:         "rgba(198,198,205,0.20)",
  shadow:          "0 12px 32px rgba(13,28,47,0.06)",
  shadowFloat:     "0 20px 48px rgba(13,28,47,0.12)",
  navBg:           "#0d1c2f",
};

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────
const PRI = {
  P1: {
    label:"P1 — Critical",
    bg:C.errorContainer, text:C.onError, dot:C.error, border:"rgba(186,26,26,0.18)", dark:C.error,
    title:"Critical",
    desc:"Hard conflict that blocks construction or requires immediate redesign. Must be resolved before any work proceeds in the affected area.",
  },
  P2: {
    label:"P2 — Coordination",
    bg:C.tertiary, text:C.onTertiary, dot:"#c96a00", border:"rgba(201,106,0,0.18)", dark:C.onTertiary,
    title:"Coordination",
    desc:"Conflict that needs coordination between trades. Does not stop work immediately but must be resolved before installation or fabrication.",
  },
  P3: {
    label:"P3 — Monitoring",
    bg:C.emeraldBg, text:C.emerald, dot:C.emerald, border:"rgba(15,107,65,0.18)", dark:C.emerald,
    title:"Monitoring",
    desc:"Minor overlap or clearance issue. Low risk — track and monitor. Can be resolved in the field or during shop drawing review.",
  },
};

const STATUS_CFG = {
  "Open":        { bg:C.errorContainer,  text:C.onError },
  "In Progress": { bg:C.tertiary,        text:C.onTertiary },
  "Resolved":    { bg:C.emeraldBg,       text:C.emerald },
  "Closed":      { bg:C.surfaceHigh,     text:C.onSurfaceFaint },
};

const DISCIPLINES = ["ARQ","STR","MEP-M","MEP-P","MEP-E","CIV","FP","TEL","LAN"];
const SPECIALTIES  = ["Architect","Structural Engineer","MEP Engineer","Plumbing","Electrical","Civil","Owner","General Contractor","Other"];

const DEFAULT_PROJECT = {
  name:"", client:"Behar Font & Partners", coordinator:"Julio Borrego",
  company:"BIM Edge Solutions Corp.", email:"julio@bimedgesolutions.com",
  website:"www.bimedgesolutions.com", date:"", cycle:"1",
  observations:"", modelsReviewed:"ARQ, STR, MEP-M, MEP-P, MEP-E",
  recipients:[],
  floorPlans:[],
};

const mkClash = () => ({
  id:`C-${Date.now().toString().slice(-4)}`,
  priority:"P1", discA:"MEP-M", discB:"STR",
  description:"", location:"", modelFile:"",
  status:"Open", assignedTo:"", dueDate:"", notes:"",
  screenshot:null,
  floorPlanId:null, pinX:null, pinY:null,
  _key: Math.random().toString(36).slice(2),
});

// ─────────────────────────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────────────────────────
function load(key, def) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : def; } catch { return def; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

async function uploadFloorPlan(file) {
  // Try to create bucket (no-op if it exists)
  await supabase.storage.createBucket(BUCKET, { public: true });
  const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: "application/pdf", upsert: false });
  if (error) throw new Error(
    error.message.includes("bucket")
      ? `Please create a public bucket named "${BUCKET}" in your Supabase dashboard → Storage.`
      : error.message
  );
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return publicUrl;
}

// ─────────────────────────────────────────────────────────────────
// TYPOGRAPHY
// ─────────────────────────────────────────────────────────────────
const headline = "'Manrope', sans-serif";
const body     = "'Inter', sans-serif";

// ─────────────────────────────────────────────────────────────────
// GLOBAL STYLES
// ─────────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');
  *, *::before, *::after { box-sizing: border-box; }
  body { margin:0; background:${C.surface}; color:${C.onSurface}; font-family:${body}; }
  input,select,textarea { outline:none; font-family:${body}; color:${C.onSurface}; }
  select option { background:#fff; color:${C.onSurface}; }
  ::placeholder { color:${C.onSurfaceFaint}; }
  ::-webkit-scrollbar { width:5px; height:5px; }
  ::-webkit-scrollbar-track { background:${C.surfaceLow}; }
  ::-webkit-scrollbar-thumb { background:${C.surfaceHigh}; border-radius:3px; }
  @keyframes fadeUp   { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  @keyframes shake    { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 75%{transform:translateX(8px)} }
  @keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:.5} }
  @keyframes slideIn  { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
  .fade-up  { animation: fadeUp  .4s ease both; }
  .slide-in { animation: slideIn .3s ease both; }
  .shake    { animation: shake   .4s ease; }
  @media print {
    .no-print { display:none !important; }
    .page-break { page-break-before: always; }
    body { background:#fff !important; }
  }
`;

// ─────────────────────────────────────────────────────────────────
// TINY HELPERS
// ─────────────────────────────────────────────────────────────────
function PriBadge({ p, lg }) {
  const c = PRI[p]||{};
  return (
    <span style={{
      background:c.bg, color:c.text,
      borderRadius:20, padding:lg?"4px 16px":"2px 10px",
      fontSize:lg?12:10, fontWeight:700, fontFamily:body,
      letterSpacing:.3, whiteSpace:"nowrap",
    }}>{p}</span>
  );
}
function StatBadge({ s }) {
  const c = STATUS_CFG[s]||{};
  return (
    <span style={{
      background:c.bg, color:c.text, borderRadius:20,
      padding:"2px 12px", fontSize:10, fontWeight:600, fontFamily:body, whiteSpace:"nowrap",
    }}>{s}</span>
  );
}
function Tag({ color=C.onPrimaryFixed, children }) {
  return (
    <span style={{
      background:color+"18", color,
      borderRadius:6, padding:"2px 8px", fontSize:10, fontFamily:body, fontWeight:600,
    }}>{children}</span>
  );
}

// ─────────────────────────────────────────────────────────────────
// PRIORITY LEGEND DROPDOWN
// ─────────────────────────────────────────────────────────────────
function PriorityLegend() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);
  return (
    <div style={{ position:"relative", display:"inline-block" }}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        background:C.surfaceLowest, borderRadius:8,
        padding:"7px 14px", color:C.onSurfaceMid, cursor:"pointer",
        fontSize:12, fontFamily:body, fontWeight:500,
        display:"flex", alignItems:"center", gap:8,
        boxShadow:C.shadow, border:"none",
      }}>
        <span>Priority Guide</span>
        {["P1","P2","P3"].map(p=>(
          <span key={p} style={{ width:8, height:8, borderRadius:"50%", background:PRI[p].dot, display:"inline-block" }}/>
        ))}
        <span style={{ fontSize:9, opacity:.5 }}>{open?"▲":"▼"}</span>
      </button>

      {open && (
        <div style={{
          position:"absolute", top:"calc(100% + 8px)", left:0, zIndex:200,
          background:`rgba(255,255,255,0.85)`, backdropFilter:"blur(20px)",
          WebkitBackdropFilter:"blur(20px)",
          borderRadius:14, padding:12, width:340,
          boxShadow:C.shadowFloat,
        }}>
          <div style={{ color:C.onSurfaceFaint, fontSize:10, fontWeight:600, letterSpacing:1.8, fontFamily:body, marginBottom:10, paddingLeft:4 }}>
            PRIORITY LEVELS
          </div>
          {Object.entries(PRI).map(([key, cfg])=>(
            <div key={key}
              onClick={()=>setActive(active===key ? null : key)}
              style={{
                borderRadius:10, padding:"10px 14px", marginBottom:6, cursor:"pointer",
                background: active===key ? cfg.bg : C.surfaceLow,
                transition:"all .2s",
              }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:cfg.dot, flexShrink:0 }}/>
                <span style={{ fontWeight:800, fontSize:13, color:active===key ? cfg.text : C.onSurface, fontFamily:headline, flex:1 }}>{key}</span>
                <span style={{ fontWeight:600, fontSize:12, color:active===key ? cfg.text : C.onSurfaceMid, fontFamily:body }}>{cfg.title}</span>
                <span style={{ color:C.onSurfaceFaint, fontSize:10 }}>{active===key?"▲":"▼"}</span>
              </div>
              {active===key && (
                <p style={{ margin:"8px 0 0 20px", fontSize:12, color:cfg.text, fontFamily:body, lineHeight:1.65 }}>{cfg.desc}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const [shake, setShake] = useState(false);
  const go = () => {
    if (pw === ADMIN_PASSWORD) { onLogin(); }
    else { setErr(true); setShake(true); setTimeout(()=>setShake(false),500); setPw(""); }
  };
  return (
    <div style={{ minHeight:"100vh", background:C.surface, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:headline }}>
      <style>{GLOBAL_CSS}</style>
      <div className="fade-up" style={{
        background:C.surfaceLowest, borderRadius:20, padding:"52px 48px", width:420,
        boxShadow:C.shadowFloat,
      }}>
        <div style={{ textAlign:"center", marginBottom:40 }}>
          <div style={{
            display:"inline-flex", alignItems:"center", gap:8,
            background:C.surfaceLow, borderRadius:10, padding:"8px 18px", marginBottom:28,
          }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:C.error }}/>
            <span style={{ color:C.error, fontWeight:800, fontSize:11, letterSpacing:3, fontFamily:headline }}>BIM EDGE SOLUTIONS</span>
          </div>
          <h1 style={{ color:C.onSurface, fontSize:26, fontWeight:800, margin:"0 0 8px", letterSpacing:-1, fontFamily:headline }}>Clash Report Builder</h1>
          <p style={{ color:C.onSurfaceFaint, fontSize:13, margin:0, fontFamily:body }}>Admin access only</p>
        </div>
        <div className={shake?"shake":""}>
          <label style={{ color:C.onSurfaceFaint, fontSize:10, fontWeight:600, letterSpacing:1.8, display:"block", marginBottom:8, fontFamily:body }}>PASSWORD</label>
          <input
            type="password" value={pw}
            onChange={e=>{ setPw(e.target.value); setErr(false); }}
            onKeyDown={e=>e.key==="Enter"&&go()}
            placeholder="Enter password"
            style={{
              width:"100%", background:err ? C.errorContainer : C.surfaceLow,
              borderRadius:10, padding:"14px 16px", color:C.onSurface, fontSize:15,
              border:"none", transition:"background .2s",
            }}
          />
          {err && <p style={{ color:C.error, fontSize:12, marginTop:6, fontFamily:body }}>Incorrect password</p>}
        </div>
        <button onClick={go} style={{
          width:"100%", marginTop:24, background:C.primaryGrad, border:"none",
          borderRadius:10, padding:14, color:"#fff", fontWeight:800, fontSize:15,
          cursor:"pointer", fontFamily:headline, letterSpacing:.3,
        }}>
          Enter Editor →
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// IMAGE UPLOADER
// ─────────────────────────────────────────────────────────────────
function ImgUpload({ value, onChange, height=220 }) {
  const ref = useRef();
  const [drag, setDrag] = useState(false);
  const handle = f => {
    if (!f||!f.type.startsWith("image/")) return;
    const r = new FileReader(); r.onload = e => onChange(e.target.result); r.readAsDataURL(f);
  };
  return (
    <div
      onClick={()=>ref.current.click()}
      onDragOver={e=>{ e.preventDefault(); setDrag(true); }}
      onDragLeave={()=>setDrag(false)}
      onDrop={e=>{ e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
      style={{
        width:"100%", height, borderRadius:12, overflow:"hidden",
        background: drag ? C.surfaceHigh : C.surfaceLow,
        cursor:"pointer", position:"relative", transition:"all .2s",
        display:"flex", alignItems:"center", justifyContent:"center",
        boxShadow: drag ? `inset 0 0 0 2px ${C.onPrimaryFixed}` : "none",
      }}>
      <input ref={ref} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>handle(e.target.files[0])}/>
      {value ? (
        <>
          <img src={value} alt="ss" style={{ width:"100%", height:"100%", objectFit:"contain", background:"#000", display:"block" }}/>
          <div
            style={{ position:"absolute", inset:0, background:"rgba(13,28,47,0.55)", display:"flex", alignItems:"center", justifyContent:"center", opacity:0, transition:"opacity .2s" }}
            onMouseEnter={e=>e.currentTarget.style.opacity=1}
            onMouseLeave={e=>e.currentTarget.style.opacity=0}>
            <span style={{ color:"#fff", fontWeight:700, fontSize:13, background:C.primaryGrad, padding:"8px 18px", borderRadius:8 }}>Replace image</span>
          </div>
        </>
      ) : (
        <div style={{ textAlign:"center", pointerEvents:"none" }}>
          <div style={{ fontSize:36, marginBottom:10 }}>📸</div>
          <p style={{ color:C.onSurfaceFaint, fontSize:13, margin:0, fontFamily:body }}>Drop screenshot or click to upload</p>
          <p style={{ color:C.onSurfaceFaint, fontSize:11, marginTop:4, opacity:.6 }}>Auto-fits · no cropping needed</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// PDF VIEWER — canvas render + SVG pin overlay
// ─────────────────────────────────────────────────────────────────
function PdfViewer({ url, pins = [], onAddPin, interactive = false }) {
  const canvasRef    = useRef();
  const containerRef = useRef();
  const [dims, setDims]       = useState({ w: 0, h: 0 });
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg]   = useState(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setLoading(true); setErrMsg(null);

    (async () => {
      try {
        const pdfDoc = await getDocument({ url }).promise;
        if (cancelled) { pdfDoc.destroy(); return; }

        const page = await pdfDoc.getPage(1);
        if (cancelled) { pdfDoc.destroy(); return; }

        const containerW = containerRef.current?.clientWidth || 800;
        const naturalVp  = page.getViewport({ scale: 1 });
        const scale      = Math.min(containerW / naturalVp.width, 2.5);
        const vp         = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) { pdfDoc.destroy(); return; }
        canvas.width  = vp.width;
        canvas.height = vp.height;
        setDims({ w: vp.width, h: vp.height });

        const renderTask = page.render({ canvasContext: canvas.getContext("2d"), viewport: vp });
        try {
          await renderTask.promise;
        } catch (re) {
          pdfDoc.destroy();
          return;
        }
        if (!cancelled) setLoading(false);
        else pdfDoc.destroy();
      } catch (e) {
        if (!cancelled) { setLoading(false); setErrMsg(e.message); }
      }
    })();

    return () => { cancelled = true; };
  }, [url]);

  const handleClick = e => {
    if (!interactive || !onAddPin) return;
    const rect = canvasRef.current.getBoundingClientRect();
    onAddPin({
      x: (e.clientX - rect.left)  / rect.width,
      y: (e.clientY - rect.top)   / rect.height,
    });
  };

  return (
    <div ref={containerRef} style={{ position:"relative", display:"block", width:"100%" }}>
      {loading && (
        <div style={{ padding:48, textAlign:"center", color:C.onSurfaceFaint, fontFamily:body, fontSize:13 }}>
          <div style={{ fontSize:32, marginBottom:10, animation:"pulse 1s infinite" }}>📄</div>
          Loading PDF…
        </div>
      )}
      {errMsg && (
        <div style={{ padding:20, color:C.error, fontSize:13, fontFamily:body, background:C.errorContainer, borderRadius:10 }}>
          ⚠ {errMsg}
        </div>
      )}
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{
          display: loading || errMsg ? "none" : "block",
          maxWidth: "100%",
          cursor: interactive ? "crosshair" : "default",
          borderRadius: 8,
        }}
      />
      {/* SVG pin overlay */}
      {!loading && !errMsg && dims.w > 0 && (
        <svg
          style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", pointerEvents:"none" }}
          viewBox={`0 0 ${dims.w} ${dims.h}`}
        >
          {pins.map((pin, i) => {
            const px    = pin.x * dims.w;
            const py    = pin.y * dims.h;
            const color = PRI[pin.priority]?.dot || "#666";
            const r     = 16;
            return (
              <g key={i}>
                <circle cx={px} cy={py + 2} r={r} fill="rgba(0,0,0,0.22)" />
                <circle cx={px} cy={py}     r={r} fill={color} />
                <text
                  x={px} y={py}
                  textAnchor="middle" dominantBaseline="central"
                  fill="#fff" fontSize={r * 0.72} fontWeight="700"
                  fontFamily="Inter, sans-serif"
                >
                  {pin.clashId}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// PIN PICKER MODAL
// ─────────────────────────────────────────────────────────────────
function PinPickerModal({ floorPlan, existingPin, clashId, priority, onConfirm, onClose }) {
  const [pin, setPin] = useState(existingPin || null);

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(13,28,47,0.65)",
      display:"flex", alignItems:"center", justifyContent:"center",
      zIndex:999, backdropFilter:"blur(6px)",
    }}>
      <div className="fade-up" style={{
        background:C.surfaceLowest, borderRadius:20,
        padding:"28px 32px", width:"min(960px, 94vw)",
        maxHeight:"92vh", overflow:"auto", boxShadow:C.shadowFloat,
      }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
          <div style={{ flex:1 }}>
            <h3 style={{ margin:0, fontFamily:headline, fontSize:18, fontWeight:800, color:C.onSurface }}>
              Pin Location — {floorPlan.name}
            </h3>
            <p style={{ margin:"4px 0 0", fontFamily:body, fontSize:12, color:C.onSurfaceFaint }}>
              {pin ? "Pin placed — drag to reposition or click again to move it." : "Click on the plan to place the clash pin."}
            </p>
          </div>
          <div style={{
            background: PRI[priority]?.bg, color: PRI[priority]?.text,
            borderRadius:8, padding:"4px 14px", fontFamily:body, fontSize:12, fontWeight:700,
          }}>
            {clashId} · {priority}
          </div>
        </div>

        {/* Instructions bar */}
        <div style={{ background:C.surfaceLow, borderRadius:10, padding:"10px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:18 }}>🎯</span>
          <span style={{ fontFamily:body, fontSize:13, color:C.onSurfaceMid }}>
            {pin
              ? `Pin at X: ${(pin.x*100).toFixed(1)}% — Y: ${(pin.y*100).toFixed(1)}%. Click elsewhere to move it.`
              : "Click anywhere on the plan to place the pin."}
          </span>
          {pin && (
            <button
              onClick={() => setPin(null)}
              style={{ marginLeft:"auto", background:"none", border:"none", color:C.error, cursor:"pointer", fontSize:12, fontFamily:body }}
            >
              ✕ Clear pin
            </button>
          )}
        </div>

        {/* PDF Viewer */}
        <div style={{ borderRadius:12, overflow:"hidden", border:`2px solid ${C.surfaceHigh}` }}>
          <PdfViewer
            url={floorPlan.pdfUrl}
            pins={pin ? [{ ...pin, clashId, priority }] : []}
            onAddPin={setPin}
            interactive
          />
        </div>

        {/* Actions */}
        <div style={{ display:"flex", gap:10, marginTop:20 }}>
          <button
            onClick={onClose}
            style={{ flex:1, background:C.surfaceLow, border:"none", borderRadius:10, padding:"12px", color:C.onSurfaceMid, cursor:"pointer", fontWeight:600, fontFamily:headline }}
          >
            Cancel
          </button>
          <button
            onClick={() => pin && onConfirm(pin)}
            disabled={!pin}
            style={{
              flex:2, border:"none", borderRadius:10, padding:"12px",
              background: pin ? C.primaryGrad : C.surfaceHigh,
              color: pin ? "#fff" : C.onSurfaceFaint,
              fontWeight:800, cursor: pin ? "pointer" : "default", fontFamily:headline, fontSize:14,
              transition:"all .2s",
            }}
          >
            {pin ? "✓ Confirm Pin Location" : "Place a pin first"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// FLOOR PLANS TAB
// ─────────────────────────────────────────────────────────────────
function FloorPlansTab({ floorPlans, onChange }) {
  const [name, setName]         = useState("");
  const [uploading, setUploading] = useState(false);
  const [errMsg, setErrMsg]     = useState("");
  const fileRef = useRef();

  const handleFile = async file => {
    if (!file || file.type !== "application/pdf") { setErrMsg("Select a PDF file."); return; }
    if (!name.trim()) { setErrMsg("Enter a level name first."); return; }
    setUploading(true); setErrMsg("");
    try {
      const url = await uploadFloorPlan(file);
      onChange([...floorPlans, { id: Math.random().toString(36).slice(2), name: name.trim(), pdfUrl: url }]);
      setName("");
    } catch (e) {
      setErrMsg(e.message);
    }
    setUploading(false);
  };

  const remove = id => onChange(floorPlans.filter(fp => fp.id !== id));

  const inp = { background:C.surfaceLow, borderRadius:8, padding:"10px 14px", color:C.onSurface, fontSize:13, fontFamily:body, border:"none", width:"100%" };

  return (
    <div className="fade-up">
      <h2 style={{ color:C.onSurface, fontSize:28, fontWeight:800, margin:"0 0 6px", letterSpacing:-0.5, fontFamily:headline }}>Floor Plans</h2>
      <p style={{ color:C.onSurfaceFaint, fontSize:13, fontFamily:body, margin:"0 0 32px" }}>
        Upload a PDF per level. Then pin clashes to exact locations on each plan.
      </p>

      {/* Add panel */}
      <div style={{ background:C.surfaceLowest, borderRadius:16, padding:28, marginBottom:28, boxShadow:C.shadow }}>
        <h3 style={{ color:C.onSurface, fontSize:16, fontWeight:700, margin:"0 0 16px", fontFamily:headline }}>Add Level Plan</h3>
        <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:12, alignItems:"end" }}>
          <div>
            <label style={{ color:C.onSurfaceFaint, fontSize:10, fontWeight:600, letterSpacing:1.5, display:"block", marginBottom:6, fontFamily:body }}>LEVEL NAME</label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setErrMsg(""); }}
              onKeyDown={e => e.key === "Enter" && fileRef.current.click()}
              placeholder="e.g. Ground Floor, Level 2, Roof, Basement"
              style={inp}
            />
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              style={{ display:"none" }}
              onChange={e => handleFile(e.target.files[0])}
            />
            <button
              onClick={() => { if (!name.trim()) { setErrMsg("Enter a level name first."); return; } fileRef.current.click(); }}
              disabled={uploading}
              style={{
                background: uploading ? C.surfaceHigh : C.primaryGrad,
                border:"none", borderRadius:8, padding:"10px 24px",
                color: uploading ? C.onSurfaceFaint : "#fff",
                fontWeight:700, fontSize:13, cursor: uploading ? "default" : "pointer",
                fontFamily:headline, whiteSpace:"nowrap",
              }}
            >
              {uploading ? "⏳ Uploading…" : "📄 Upload PDF"}
            </button>
          </div>
        </div>
        {errMsg && (
          <div style={{ marginTop:10, color:C.error, fontSize:12, fontFamily:body, background:C.errorContainer, borderRadius:8, padding:"8px 12px" }}>
            ⚠ {errMsg}
          </div>
        )}
        <p style={{ color:C.onSurfaceFaint, fontSize:11, fontFamily:body, marginTop:10, marginBottom:0, lineHeight:1.6 }}>
          <strong style={{ color:C.onSurfaceMid }}>Note:</strong> Requires a public Supabase Storage bucket named <code>floor-plans</code>.
          Create it in your Supabase Dashboard → Storage if it doesn't exist yet.
        </p>
      </div>

      {/* Plans list */}
      {floorPlans.length === 0 ? (
        <div style={{ background:C.surfaceLowest, borderRadius:16, padding:"60px 40px", textAlign:"center", boxShadow:C.shadow }}>
          <div style={{ fontSize:44, marginBottom:12 }}>🗺</div>
          <p style={{ color:C.onSurfaceFaint, fontFamily:body }}>No floor plans yet. Add one above.</p>
        </div>
      ) : (
        floorPlans.map(fp => (
          <div key={fp.id} style={{ background:C.surfaceLowest, borderRadius:14, padding:"16px 20px", marginBottom:10, boxShadow:C.shadow, display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:36, height:36, borderRadius:8, background:C.surfaceLow, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>📄</div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:14, color:C.onSurface, fontFamily:headline }}>{fp.name}</div>
              <div style={{ fontSize:11, color:C.onSurfaceFaint, fontFamily:body, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:480 }}>{fp.pdfUrl}</div>
            </div>
            <a href={fp.pdfUrl} target="_blank" rel="noreferrer" style={{ background:C.surfaceLow, borderRadius:8, padding:"7px 14px", color:C.onPrimaryFixed, fontSize:12, fontFamily:body, fontWeight:600, textDecoration:"none" }}>
              Open ↗
            </a>
            <button
              onClick={() => remove(fp.id)}
              style={{ background:"none", border:"none", color:C.onSurfaceFaint, cursor:"pointer", fontSize:18, padding:"0 4px" }}
            >
              ×
            </button>
          </div>
        ))
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// RECIPIENTS MANAGER
// ─────────────────────────────────────────────────────────────────
function RecipientsPanel({ recipients, onChange }) {
  const [name, setName]   = useState("");
  const [email, setEmail] = useState("");
  const [spec, setSpec]   = useState(SPECIALTIES[0]);
  const add = () => {
    if (!email.trim()) return;
    onChange([...recipients, { name:name.trim()||email, email:email.trim().toLowerCase(), specialty:spec, id:Math.random().toString(36).slice(2) }]);
    setName(""); setEmail(""); setSpec(SPECIALTIES[0]);
  };
  const remove = id => onChange(recipients.filter(r=>r.id!==id));
  const inp = { background:C.surfaceLow, borderRadius:8, padding:"9px 12px", color:C.onSurface, fontSize:13, width:"100%", border:"none", fontFamily:body };
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1.4fr 1.2fr auto", gap:10, marginBottom:14, alignItems:"end" }}>
        <div>
          <label style={{ color:C.onSurfaceFaint, fontSize:10, fontWeight:600, letterSpacing:1.5, display:"block", marginBottom:5, fontFamily:body }}>NAME</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="John Smith" style={inp}/>
        </div>
        <div>
          <label style={{ color:C.onSurfaceFaint, fontSize:10, fontWeight:600, letterSpacing:1.5, display:"block", marginBottom:5, fontFamily:body }}>EMAIL *</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="john@firm.com" style={inp}/>
        </div>
        <div>
          <label style={{ color:C.onSurfaceFaint, fontSize:10, fontWeight:600, letterSpacing:1.5, display:"block", marginBottom:5, fontFamily:body }}>SPECIALTY</label>
          <select value={spec} onChange={e=>setSpec(e.target.value)} style={inp}>
            {SPECIALTIES.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <button onClick={add} style={{ background:C.primaryGrad, border:"none", borderRadius:8, padding:"9px 18px", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:headline, whiteSpace:"nowrap" }}>+ Add</button>
      </div>
      {recipients.length===0 && (
        <p style={{ color:C.onSurfaceFaint, fontSize:12, fontFamily:body, textAlign:"center", padding:"16px 0" }}>No recipients yet. Add at least one to send the report.</p>
      )}
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {recipients.map(r=>(
          <div key={r.id} className="slide-in" style={{ display:"flex", alignItems:"center", gap:12, background:C.surfaceLow, borderRadius:10, padding:"10px 16px" }}>
            <div style={{ width:34, height:34, borderRadius:"50%", background:C.surfaceHigh, display:"flex", alignItems:"center", justifyContent:"center", color:C.onPrimaryFixed, fontWeight:800, fontSize:14, flexShrink:0 }}>{(r.name||r.email)[0].toUpperCase()}</div>
            <div style={{ flex:1 }}>
              <div style={{ color:C.onSurface, fontWeight:600, fontSize:14, fontFamily:headline }}>{r.name||r.email}</div>
              <div style={{ color:C.onSurfaceFaint, fontSize:12, fontFamily:body }}>{r.email}</div>
            </div>
            <Tag color={C.onPrimaryFixed}>{r.specialty}</Tag>
            <button onClick={()=>remove(r.id)} style={{ background:"none", border:"none", color:C.onSurfaceFaint, cursor:"pointer", fontSize:18, padding:"0 4px" }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// CLASH FORM CARD
// ─────────────────────────────────────────────────────────────────
const FIELD_INP = { width:"100%", background:C.surfaceLow, borderRadius:8, padding:"9px 12px", color:C.onSurface, fontSize:13, border:"none", fontFamily:body, transition:"background .15s" };
const FIELD_LBL = { color:C.onSurfaceFaint, fontSize:10, fontWeight:600, letterSpacing:1.5, display:"block", marginBottom:5, fontFamily:body };

function ClashField({ label, field, type="text", opts, span=1, clash, onChange }) {
  return (
    <div style={{ gridColumn:`span ${span}` }}>
      <label style={FIELD_LBL}>{label}</label>
      {opts
        ? <select value={clash[field]} onChange={e=>onChange(field,e.target.value)} style={FIELD_INP}>{opts.map(o=><option key={o}>{o}</option>)}</select>
        : type==="textarea"
          ? <textarea value={clash[field]} onChange={e=>onChange(field,e.target.value)} rows={2} style={{ ...FIELD_INP, resize:"vertical" }}/>
          : <input type={type} value={clash[field]} onChange={e=>onChange(field,e.target.value)} style={FIELD_INP}/>
      }
    </div>
  );
}

function ClashCard({ clash, idx, onChange, onRemove, comments, floorPlans }) {
  const [open, setOpen]           = useState(idx===0);
  const [showPinModal, setShowPin] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState(clash.floorPlanId || "");
  const cfg = PRI[clash.priority]||PRI.P1;
  const myComments = comments.filter(c=>c.clashKey===clash._key);
  const activePlan = floorPlans?.find(fp => fp.id === (selectedPlanId || clash.floorPlanId));

  return (
    <div style={{
      background:C.surfaceLowest, borderRadius:14, overflow:"hidden",
      marginBottom:10, boxShadow:C.shadow,
      borderLeft: clash.priority==="P1" ? `4px solid ${C.error}` : `4px solid transparent`,
    }}>
      <div
        onClick={()=>setOpen(!open)}
        style={{
          display:"flex", alignItems:"center", gap:12, padding:"14px 20px",
          cursor:"pointer", background: open ? C.surfaceLow : C.surfaceLowest,
          transition:"background .2s",
        }}>
        <div style={{ width:8, height:8, borderRadius:"50%", background:cfg.dot, flexShrink:0 }}/>
        <span style={{ color:C.onSurface, fontWeight:700, fontSize:14, flex:1, fontFamily:headline }}>{clash.id} — {clash.description||"New Clash"}</span>
        {clash.pinX != null && <Tag color={C.onPrimaryFixed}>📍 Pinned</Tag>}
        {myComments.length>0 && <Tag color={C.onPrimaryFixed}>💬 {myComments.length}</Tag>}
        <PriBadge p={clash.priority}/><StatBadge s={clash.status}/>
        <span style={{ color:C.onSurfaceFaint, fontSize:16 }}>{open?"▲":"▼"}</span>
      </div>

      {open && (
        <div style={{ padding:"20px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
            <ClashField label="CLASH ID"            field="id"          clash={clash} onChange={onChange}/>
            <ClashField label="PRIORITY"            field="priority"    opts={["P1","P2","P3"]} clash={clash} onChange={onChange}/>
            <ClashField label="DESCRIPTION"         field="description" type="textarea" span={2} clash={clash} onChange={onChange}/>
            <ClashField label="DISCIPLINE A"        field="discA"       opts={DISCIPLINES} clash={clash} onChange={onChange}/>
            <ClashField label="DISCIPLINE B"        field="discB"       opts={DISCIPLINES} clash={clash} onChange={onChange}/>
            <ClashField label="LEVEL / AREA"        field="location"    clash={clash} onChange={onChange}/>
            <ClashField label="MODEL FILE (.rvt)"   field="modelFile"   clash={clash} onChange={onChange}/>
            <ClashField label="STATUS"              field="status"      opts={["Open","In Progress","Resolved","Closed"]} clash={clash} onChange={onChange}/>
            <ClashField label="ASSIGNED TO"         field="assignedTo"  clash={clash} onChange={onChange}/>
            <ClashField label="DUE DATE"            field="dueDate"     type="date" clash={clash} onChange={onChange}/>
            <ClashField label="RESOLUTION NOTES"    field="notes"       type="textarea" span={2} clash={clash} onChange={onChange}/>
          </div>

          {/* Screenshot */}
          <label style={FIELD_LBL}>SCREENSHOT — drop or click, auto-fits to frame</label>
          <ImgUpload value={clash.screenshot} onChange={v=>onChange("screenshot",v)}/>

          {/* Floor Plan Pin */}
          {floorPlans && floorPlans.length > 0 && (
            <div style={{ marginTop:16 }}>
              <label style={FIELD_LBL}>FLOOR PLAN PIN</label>
              <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, alignItems:"center" }}>
                <select
                  value={selectedPlanId}
                  onChange={e => {
                    const val = e.target.value;
                    setSelectedPlanId(val);
                    onChange("floorPlanId", val || null);
                    onChange("pinX", null);
                    onChange("pinY", null);
                  }}
                  style={FIELD_INP}
                >
                  <option value="">— No floor plan —</option>
                  {floorPlans.map(fp => <option key={fp.id} value={fp.id}>{fp.name}</option>)}
                </select>
                {selectedPlanId && (
                  <button
                    onClick={() => setShowPin(true)}
                    style={{
                      background: clash.pinX != null ? C.emeraldBg : C.primaryGrad,
                      border: clash.pinX != null ? `1px solid ${C.emerald}` : "none",
                      borderRadius:8, padding:"9px 18px",
                      color: clash.pinX != null ? C.emerald : "#fff",
                      fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:headline, whiteSpace:"nowrap",
                    }}
                  >
                    {clash.pinX != null ? "📍 Move Pin" : "📍 Set Pin"}
                  </button>
                )}
              </div>
              {clash.pinX != null && activePlan && (
                <div style={{ marginTop:8, background:C.emeraldBg, borderRadius:8, padding:"8px 14px", display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:14 }}>📍</span>
                  <span style={{ fontSize:12, color:C.emerald, fontFamily:body }}>
                    Pinned on <strong>{activePlan.name}</strong> at ({(clash.pinX*100).toFixed(1)}%, {(clash.pinY*100).toFixed(1)}%)
                  </span>
                  <button
                    onClick={() => { onChange("pinX", null); onChange("pinY", null); }}
                    style={{ marginLeft:"auto", background:"none", border:"none", color:C.error, cursor:"pointer", fontSize:11, fontFamily:body }}
                  >
                    ✕ Remove
                  </button>
                </div>
              )}
            </div>
          )}

          {floorPlans && floorPlans.length === 0 && (
            <div style={{ marginTop:16, background:C.surfaceLow, borderRadius:10, padding:"10px 16px", fontSize:12, color:C.onSurfaceFaint, fontFamily:body }}>
              💡 Add floor plans in the <strong>Floor Plans</strong> tab to pin this clash to a plan.
            </div>
          )}

          {myComments.length>0 && (
            <div style={{ marginTop:16 }}>
              <div style={{ color:C.onSurfaceFaint, fontSize:10, fontWeight:600, letterSpacing:1.5, marginBottom:8, fontFamily:body }}>CLIENT COMMENTS ({myComments.length})</div>
              {myComments.map(c=>(
                <div key={c.id} style={{ background:C.surfaceLow, borderRadius:8, padding:"10px 14px", marginBottom:6 }}>
                  <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4 }}>
                    <Tag color={C.onPrimaryFixed}>{c.author}</Tag>
                    <span style={{ color:C.onSurfaceFaint, fontSize:11, fontFamily:body }}>{c.specialty}</span>
                    <span style={{ color:C.onSurfaceFaint, fontSize:11, fontFamily:body, flex:1, textAlign:"right" }}>{new Date(c.ts).toLocaleDateString()}</span>
                  </div>
                  <p style={{ color:C.onSurfaceMid, fontSize:13, margin:0 }}>{c.text}</p>
                </div>
              ))}
            </div>
          )}

          <button onClick={onRemove} style={{ marginTop:14, background:"none", borderRadius:8, padding:"8px 16px", color:C.error, cursor:"pointer", fontSize:12, fontFamily:body, border:"none" }}>✕ Remove clash</button>
        </div>
      )}

      {/* Pin picker modal */}
      {showPinModal && activePlan && (
        <PinPickerModal
          floorPlan={activePlan}
          existingPin={clash.pinX != null ? { x: clash.pinX, y: clash.pinY } : null}
          clashId={clash.id}
          priority={clash.priority}
          onConfirm={pin => { onChange("pinX", pin.x); onChange("pinY", pin.y); setShowPin(false); }}
          onClose={() => setShowPin(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SEND REPORT PANEL — glass modal
// ─────────────────────────────────────────────────────────────────
function SendPanel({ project, clashes, onClose }) {
  const [status, setStatus] = useState("idle");
  const [msg, setMsg] = useState("");
  const [reportUrl, setReportUrl] = useState("");

  const send = async () => {
    if (project.recipients.length===0) { setMsg("Add at least one recipient first."); return; }
    setStatus("sending");
    try {
      const { data, error } = await supabase
        .from("reports")
        .insert({ project, clashes })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      const url = `${APP_PUBLIC_URL}/?id=${data.id}`;
      setReportUrl(url);

      const sharedFields = {
        project:project.name, cycle:project.cycle, client:project.client,
        coordinator:project.coordinator, date:project.date,
        totalClashes:clashes.length,
        p1:clashes.filter(c=>c.priority==="P1").length,
        p2:clashes.filter(c=>c.priority==="P2").length,
        p3:clashes.filter(c=>c.priority==="P3").length,
        reportUrl: url,
      };
      // Send one webhook call per recipient so n8n $json has all fields flat
      try {
        await Promise.all(project.recipients.map(r =>
          fetch(N8N_WEBHOOK_URL, {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({ ...sharedFields, ...r }),
          }).catch(() => {})
        ));
      } catch { console.warn("n8n not reachable"); }

      setStatus("done");
    } catch(e) {
      setStatus("error"); setMsg(e.message);
    }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(13,28,47,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, fontFamily:headline, backdropFilter:"blur(4px)" }}>
      <div className="fade-up" style={{
        background:`rgba(255,255,255,0.80)`, backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
        borderRadius:20, padding:"40px 36px", width:520, boxShadow:C.shadowFloat,
      }}>
        {status==="idle" && <>
          <h2 style={{ color:C.onSurface, fontSize:22, fontWeight:800, margin:"0 0 6px", fontFamily:headline }}>Send Report to Clients</h2>
          <p style={{ color:C.onSurfaceFaint, fontSize:13, fontFamily:body, margin:"0 0 28px" }}>
            {project.recipients.length} recipient{project.recipients.length!==1?"s":""} will receive a link to the interactive report.
          </p>
          <div style={{ marginBottom:24 }}>
            {project.recipients.map(r=>(
              <div key={r.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                <div style={{ width:30, height:30, borderRadius:"50%", background:C.surfaceHigh, display:"flex", alignItems:"center", justifyContent:"center", color:C.onPrimaryFixed, fontWeight:800, fontSize:13 }}>{(r.name||r.email)[0].toUpperCase()}</div>
                <div style={{ flex:1 }}>
                  <div style={{ color:C.onSurface, fontSize:13, fontWeight:600, fontFamily:headline }}>{r.name}</div>
                  <div style={{ color:C.onSurfaceFaint, fontSize:11, fontFamily:body }}>{r.email}</div>
                </div>
                <Tag color={C.onPrimaryFixed}>{r.specialty}</Tag>
              </div>
            ))}
          </div>
          <div style={{ background:C.surfaceLow, borderRadius:10, padding:"12px 16px", marginBottom:20 }}>
            <div style={{ color:C.onSurfaceFaint, fontSize:10, letterSpacing:1.5, marginBottom:4, fontFamily:body }}>REPORT LINK</div>
            <div style={{ color:C.onPrimaryFixed, fontSize:12, fontFamily:body, wordBreak:"break-all" }}>{reportUrl}</div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:24 }}>
            {[["Total",clashes.length,C.onSurface],["P1",clashes.filter(c=>c.priority==="P1").length,C.error],["P2",clashes.filter(c=>c.priority==="P2").length,"#c96a00"],["P3",clashes.filter(c=>c.priority==="P3").length,C.emerald]].map(([l,v,col])=>(
              <div key={l} style={{ background:C.surfaceLow, borderRadius:10, padding:"14px 10px", textAlign:"center" }}>
                <div style={{ fontSize:26, fontWeight:800, color:col, fontFamily:headline }}>{v}</div>
                <div style={{ fontSize:10, color:C.onSurfaceFaint, fontFamily:body, marginTop:3 }}>{l.toUpperCase()}</div>
              </div>
            ))}
          </div>
          {msg && <p style={{ color:C.error, fontSize:12, fontFamily:body, marginBottom:12 }}>{msg}</p>}
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={onClose} style={{ flex:1, background:C.surfaceLow, borderRadius:10, padding:13, color:C.onSurfaceMid, cursor:"pointer", fontWeight:600, fontFamily:headline, border:"none" }}>Cancel</button>
            <button onClick={send} style={{ flex:2, background:C.primaryGrad, border:"none", borderRadius:10, padding:13, color:"#fff", fontWeight:800, cursor:"pointer", fontFamily:headline, fontSize:15 }}>
              📤 Send to {project.recipients.length} recipient{project.recipients.length!==1?"s":""}
            </button>
          </div>
        </>}

        {status==="sending" && (
          <div style={{ textAlign:"center", padding:"20px 0" }}>
            <div style={{ fontSize:48, marginBottom:16, animation:"pulse 1s infinite" }}>📡</div>
            <h3 style={{ color:C.onSurface, fontWeight:800, margin:"0 0 8px", fontFamily:headline }}>Saving report…</h3>
            <p style={{ color:C.onSurfaceFaint, fontFamily:body, fontSize:13 }}>Uploading to database · sending emails</p>
          </div>
        )}

        {status==="done" && (
          <div style={{ textAlign:"center", padding:"20px 0" }}>
            <div style={{ fontSize:56, marginBottom:16 }}>✅</div>
            <h3 style={{ color:C.onSurface, fontWeight:800, margin:"0 0 8px", fontFamily:headline }}>Report Sent!</h3>
            <p style={{ color:C.onSurfaceFaint, fontFamily:body, fontSize:13, marginBottom:16 }}>
              {project.recipients.length} recipient{project.recipients.length!==1?"s":""} will receive this link:
            </p>
            <div style={{ background:C.surfaceLow, borderRadius:10, padding:"10px 14px", marginBottom:24, cursor:"pointer" }}
              onClick={()=>navigator.clipboard.writeText(reportUrl)}>
              <div style={{ color:C.onPrimaryFixed, fontSize:12, fontFamily:body, wordBreak:"break-all" }}>{reportUrl}</div>
              <div style={{ color:C.onSurfaceFaint, fontSize:10, marginTop:4, fontFamily:body }}>Click to copy</div>
            </div>
            <button onClick={onClose} style={{ background:C.primaryGrad, border:"none", borderRadius:10, padding:"12px 32px", color:"#fff", fontWeight:800, cursor:"pointer", fontFamily:headline }}>Done</button>
          </div>
        )}

        {status==="error" && (
          <div style={{ textAlign:"center", padding:"20px 0" }}>
            <div style={{ fontSize:48, marginBottom:16 }}>❌</div>
            <h3 style={{ color:C.onSurface, fontWeight:800, fontFamily:headline }}>Webhook error</h3>
            <p style={{ color:C.error, fontFamily:body, fontSize:12 }}>{msg}</p>
            <div style={{ display:"flex", gap:10, marginTop:20 }}>
              <button onClick={()=>setStatus("idle")} style={{ flex:1, background:C.surfaceLow, borderRadius:10, padding:12, color:C.onSurfaceMid, cursor:"pointer", fontFamily:headline, border:"none" }}>Back</button>
              <button onClick={send} style={{ flex:1, background:C.primaryGrad, border:"none", borderRadius:10, padding:12, color:"#fff", fontWeight:700, cursor:"pointer", fontFamily:headline }}>Retry</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// CLIENT COMMENT BOX
// ─────────────────────────────────────────────────────────────────
function CommentBox({ clashKey, comments, onAdd, reportId }) {
  const [name, setName]     = useState("");
  const [spec, setSpec]     = useState(SPECIALTIES[0]);
  const [text, setText]     = useState("");
  const [open, setOpen]     = useState(false);
  const [saving, setSaving] = useState(false);
  const mine = comments.filter(c=>c.clashKey===clashKey);
  const submit = async () => {
    if (!text.trim()) return;
    if (reportId) {
      setSaving(true);
      const { error } = await supabase.from("comments").insert({
        report_id: reportId, clash_id: clashKey,
        author: name||"Anonymous", specialty: spec, text: text.trim(),
      });
      setSaving(false);
      if (!error) {
        onAdd({ id:Math.random().toString(36).slice(2), clashKey, author:name||"Anonymous", specialty:spec, text:text.trim(), ts:Date.now() });
        setText(""); setOpen(false);
      }
    } else {
      onAdd({ id:Math.random().toString(36).slice(2), clashKey, author:name||"Anonymous", specialty:spec, text:text.trim(), ts:Date.now() });
      setText(""); setOpen(false);
    }
  };
  const inp = { width:"100%", background:C.surfaceHigh, borderRadius:8, padding:"9px 12px", color:C.onSurface, fontSize:13, fontFamily:body, border:"none" };
  return (
    <div style={{ padding:"16px 20px", background:C.surfaceLow }}>
      {mine.map(c=>(
        <div key={c.id} style={{ background:C.surfaceLowest, borderRadius:10, padding:"12px 16px", marginBottom:8, boxShadow:C.shadow }}>
          <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
            <div style={{ width:28, height:28, borderRadius:"50%", background:C.surfaceHigh, display:"flex", alignItems:"center", justifyContent:"center", color:C.onPrimaryFixed, fontWeight:800, fontSize:12 }}>{c.author[0].toUpperCase()}</div>
            <div>
              <div style={{ fontWeight:700, fontSize:13, color:C.onSurface, fontFamily:headline }}>{c.author}</div>
              <div style={{ fontSize:11, color:C.onSurfaceFaint, fontFamily:body }}>{c.specialty} · {new Date(c.ts).toLocaleDateString()}</div>
            </div>
          </div>
          <p style={{ color:C.onSurfaceMid, fontSize:13, margin:0, lineHeight:1.6 }}>{c.text}</p>
        </div>
      ))}
      {!open ? (
        <button onClick={()=>setOpen(true)} style={{
          background:C.surfaceContainer,
          borderRadius:8, padding:"9px 18px",
          color:C.onSurfaceFaint, cursor:"pointer", fontSize:13,
          fontFamily:body, width:"100%", marginTop:mine.length>0?8:0, border:"none",
        }}>
          💬 Add comment on this clash
        </button>
      ) : (
        <div className="slide-in" style={{ background:C.surfaceLowest, borderRadius:12, padding:16, marginTop:8, boxShadow:C.shadow }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
            <div>
              <label style={{ color:C.onSurfaceFaint, fontSize:10, fontWeight:600, letterSpacing:1.5, display:"block", marginBottom:5, fontFamily:body }}>YOUR NAME</label>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="John Smith" style={inp}/>
            </div>
            <div>
              <label style={{ color:C.onSurfaceFaint, fontSize:10, fontWeight:600, letterSpacing:1.5, display:"block", marginBottom:5, fontFamily:body }}>SPECIALTY</label>
              <select value={spec} onChange={e=>setSpec(e.target.value)} style={inp}>
                {SPECIALTIES.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <textarea value={text} onChange={e=>setText(e.target.value)} rows={3}
            placeholder="Describe your observation, proposed solution, or question about this clash…"
            style={{ ...inp, resize:"vertical", marginBottom:10 }}/>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>setOpen(false)} style={{ flex:1, background:C.surfaceLow, borderRadius:8, padding:10, color:C.onSurfaceMid, cursor:"pointer", fontFamily:headline, border:"none" }}>Cancel</button>
            <button
              onClick={submit}
              disabled={saving}
              style={{
                flex:2, border:"none", borderRadius:8, padding:10, fontWeight:700, cursor:"pointer", fontFamily:headline,
                background: text.trim() ? C.primaryGrad : "none",
                color: text.trim() ? "#fff" : C.onPrimaryFixed,
                opacity: saving ? 0.6 : 1,
              }}>
              {saving ? "Saving…" : "Submit Comment"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// REPORT VIEW (client-facing)
// ─────────────────────────────────────────────────────────────────
function ReportView({ project, clashes, comments, onAddComment, onBack, reportId }) {
  const p1=clashes.filter(c=>c.priority==="P1"), p2=clashes.filter(c=>c.priority==="P2"), p3=clashes.filter(c=>c.priority==="P3");
  const open=clashes.filter(c=>c.status==="Open").length;
  const resolved=clashes.filter(c=>["Resolved","Closed"].includes(c.status)).length;

  const floorPlans = project.floorPlans || [];
  // Only plans that have at least one pinned clash
  const plansWithPins = floorPlans.filter(fp =>
    clashes.some(c => c.floorPlanId === fp.id && c.pinX != null)
  );

  const TH = ({children}) => <th style={{ background:C.navBg, color:"#fff", padding:"10px 14px", textAlign:"left", fontSize:11, letterSpacing:1.2, fontWeight:600, fontFamily:body }}>{children}</th>;
  const TD = ({children, center, mono:m}) => <td style={{ padding:"10px 14px", borderBottom:`1px solid ${C.surfaceHigh}`, fontSize:13, textAlign:center?"center":"left", fontFamily:m?body:"inherit", verticalAlign:"middle" }}>{children}</td>;

  return (
    <div style={{ background:C.surface, minHeight:"100vh", fontFamily:body }}>
      <style>{GLOBAL_CSS}</style>
      {/* Top bar */}
      <div className="no-print" style={{ position:"sticky", top:0, zIndex:100, background:C.navBg, padding:"12px 32px", display:"flex", alignItems:"center", gap:14 }}>
        {onBack && <button onClick={onBack} style={{ background:"rgba(255,255,255,0.08)", borderRadius:8, padding:"8px 16px", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:13, fontFamily:body, border:"none" }}>← Editor</button>}
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:C.error }}/>
          <span style={{ color:C.error, fontWeight:800, fontSize:11, letterSpacing:2, fontFamily:headline }}>BIM EDGE</span>
        </div>
        <span style={{ color:"rgba(255,255,255,0.4)", fontSize:13, fontFamily:body }}>{project.name||"Project"} · Cycle {project.cycle}</span>
        <div style={{ flex:1 }}/>
        <span style={{ color:"rgba(255,255,255,0.3)", fontSize:12, fontFamily:body }} className="no-print">Client view — comments enabled</span>
        <button onClick={()=>window.print()} style={{ background:C.primaryGrad, border:"none", borderRadius:8, padding:"8px 20px", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:headline }}>🖨 Export PDF</button>
      </div>

      <div style={{ maxWidth:920, margin:"0 auto", padding:"44px 28px" }}>
        {/* COVER */}
        <div className="fade-up" style={{
          background:`linear-gradient(135deg, ${C.navBg} 0%, #0f2244 100%)`,
          color:"#fff", padding:"52px 48px", borderRadius:20, marginBottom:44,
          position:"relative", overflow:"hidden",
          boxShadow:"0 20px 60px rgba(13,28,47,0.15)",
        }}>
          <div style={{ position:"absolute", top:-40, right:-40, width:200, height:200, borderRadius:"50%", background:"rgba(233,69,96,0.07)" }}/>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:32 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:C.error }}/>
            <span style={{ color:C.error, fontWeight:800, fontSize:11, letterSpacing:3, fontFamily:headline }}>BIM EDGE SOLUTIONS CORP.</span>
          </div>
          <h1 style={{ fontSize:38, fontWeight:800, margin:"0 0 8px", letterSpacing:-1.5, fontFamily:headline }}>Clash Detection Report</h1>
          <h2 style={{ fontSize:22, fontWeight:600, color:C.error, margin:"0 0 36px", fontFamily:headline }}>Cycle {project.cycle} · Coordination Review</h2>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px 48px", color:"rgba(255,255,255,0.5)", fontSize:14 }}>
            {[["Project",project.name||"—"],["Client",project.client],["Date",project.date||"—"],["Coordinator",project.coordinator],["Models",project.modelsReviewed],["Contact",project.email]].map(([k,v])=>(
              <div key={k}>
                <div style={{ color:"rgba(255,255,255,0.3)", fontSize:10, letterSpacing:2, fontFamily:body, marginBottom:3 }}>{k.toUpperCase()}</div>
                <div style={{ color:"#fff", fontWeight:600, fontFamily:headline }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div style={{ color:C.onSurface, fontWeight:800, fontSize:13, letterSpacing:2, marginBottom:16, display:"flex", alignItems:"center", gap:10 }} className="fade-up">
          <span style={{ color:C.error, fontSize:22, fontFamily:headline }}>01</span>
          <span style={{ fontFamily:headline }}>EXECUTIVE SUMMARY</span>
        </div>
        <div className="fade-up" style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:10, marginBottom:20 }}>
          {[["Total",clashes.length,C.navBg,"#fff"],[" P1",p1.length,C.errorContainer,C.onError],["P2",p2.length,C.tertiary,C.onTertiary],["P3",p3.length,C.emeraldBg,C.emerald],["Open",open,C.errorContainer,C.onError],["Resolved",resolved,C.emeraldBg,C.emerald]].map(([l,v,bg,col])=>(
            <div key={l} style={{ background:bg, borderRadius:12, padding:"20px 8px", textAlign:"center", boxShadow:C.shadow }}>
              <div style={{ fontSize:34, fontWeight:800, color:col, lineHeight:1, fontFamily:headline }}>{v}</div>
              <div style={{ fontSize:9, color:col, fontWeight:600, marginTop:6, letterSpacing:1.2, fontFamily:body, opacity:.7 }}>{l.trim().toUpperCase()}</div>
            </div>
          ))}
        </div>

        {project.observations && (
          <div className="fade-up" style={{ background:C.surfaceLow, borderRadius:12, padding:"16px 20px", marginBottom:20, fontSize:14, color:C.onSurfaceMid, lineHeight:1.7, boxShadow:C.shadow }}>
            <strong style={{ color:C.onSurface, fontFamily:headline }}>General Observations: </strong>{project.observations}
          </div>
        )}

        {/* CLASH TABLE */}
        <div style={{ color:C.onSurface, fontWeight:800, fontSize:13, letterSpacing:2, margin:"40px 0 16px", display:"flex", alignItems:"center", gap:10 }} className="fade-up">
          <span style={{ color:C.error, fontSize:22, fontFamily:headline }}>02</span>
          <span style={{ fontFamily:headline }}>CLASH LOG</span>
        </div>
        <div className="fade-up" style={{ borderRadius:14, overflow:"hidden", marginBottom:8, overflowX:"auto", boxShadow:C.shadow }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr>{["ID","Priority","Disc A","Disc B","Description","Location","Status","Assigned","Plan"].map(h=><TH key={h}>{h}</TH>)}</tr></thead>
            <tbody>
              {clashes.length===0 && <tr><td colSpan={9} style={{ padding:"20px", textAlign:"center", color:C.onSurfaceFaint, fontFamily:body }}>No clashes.</td></tr>}
              {clashes.map((c,i)=>{
                const plan = floorPlans.find(fp => fp.id === c.floorPlanId);
                return (
                  <tr key={c._key} style={{ background:i%2?C.surfaceLow:C.surfaceLowest }}>
                    <TD mono>{c.id}</TD><TD><PriBadge p={c.priority}/></TD>
                    <TD mono>{c.discA}</TD><TD mono>{c.discB}</TD>
                    <TD>{c.description}</TD><TD>{c.location}</TD>
                    <TD><StatBadge s={c.status}/></TD><TD>{c.assignedTo||"—"}</TD>
                    <TD>{plan ? <span style={{ fontSize:11 }}>📍 {plan.name}</span> : <span style={{ color:C.onSurfaceFaint }}>—</span>}</TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* SCREENSHOT CARDS */}
        <div style={{ color:C.onSurface, fontWeight:800, fontSize:13, letterSpacing:2, margin:"40px 0 16px", display:"flex", alignItems:"center", gap:10 }} className="page-break fade-up">
          <span style={{ color:C.error, fontSize:22, fontFamily:headline }}>03</span>
          <span style={{ fontFamily:headline }}>CLASH SCREENSHOTS & COMMENTS</span>
        </div>
        {clashes.map((c)=>{
          const cfg=PRI[c.priority]||PRI.P1;
          return (
            <div key={c._key} className="fade-up" style={{
              background:C.surfaceLowest, borderRadius:14, overflow:"hidden", marginBottom:28,
              boxShadow:C.shadow,
              borderLeft: c.priority==="P1" ? `4px solid ${C.error}` : "4px solid transparent",
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 20px", background:cfg.bg }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:cfg.dot }}/>
                <span style={{ fontFamily:body, fontWeight:700, fontSize:13, color:cfg.text }}>{c.id}</span>
                <span style={{ flex:1, fontWeight:700, fontSize:15, color:C.onSurface, fontFamily:headline }}>{c.description}</span>
                <PriBadge p={c.priority} lg/><StatBadge s={c.status}/>
              </div>
              <div style={{ width:"100%", height:360, background:C.navBg, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}>
                {c.screenshot
                  ? <img src={c.screenshot} alt={c.id} style={{ width:"100%", height:"100%", objectFit:"contain" }}/>
                  : <div style={{ textAlign:"center", color:"rgba(255,255,255,0.3)" }}><div style={{ fontSize:40, marginBottom:8 }}>📸</div><p style={{ fontFamily:body, fontSize:13 }}>No screenshot</p></div>}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr" }}>
                {[["Location",c.location||"—"],["Trades",`${c.discA} vs ${c.discB}`],["Model",c.modelFile||"—"],["Floor Plan",floorPlans.find(fp=>fp.id===c.floorPlanId)?.name||(c.pinX!=null?"Pinned":"—")]].map(([k,v])=>(
                  <div key={k} style={{ padding:"12px 18px", background: C.surfaceLow }}>
                    <div style={{ fontSize:10, color:C.onSurfaceFaint, fontFamily:body, letterSpacing:1.5, marginBottom:4 }}>{k.toUpperCase()}</div>
                    <div style={{ fontSize:13, fontWeight:600, color:C.onSurface, fontFamily:headline }}>{v}</div>
                  </div>
                ))}
              </div>
              {c.notes && (
                <div style={{ background:C.surface, padding:"12px 18px" }}>
                  <span style={{ fontSize:10, color:C.onSurfaceFaint, fontFamily:body, letterSpacing:1.5 }}>RESOLUTION NOTES — </span>
                  <span style={{ fontSize:13, color:C.onSurfaceMid, fontFamily:body }}>{c.notes}</span>
                </div>
              )}
              <div className="no-print">
                <CommentBox clashKey={c._key} comments={comments} onAdd={onAddComment} reportId={reportId}/>
              </div>
            </div>
          );
        })}

        {/* FLOOR PLAN OVERVIEW */}
        {plansWithPins.length > 0 && (
          <>
            <div style={{ color:C.onSurface, fontWeight:800, fontSize:13, letterSpacing:2, margin:"40px 0 16px", display:"flex", alignItems:"center", gap:10 }} className="page-break fade-up">
              <span style={{ color:C.error, fontSize:22, fontFamily:headline }}>04</span>
              <span style={{ fontFamily:headline }}>FLOOR PLAN OVERVIEW</span>
            </div>
            <p className="fade-up" style={{ color:C.onSurfaceFaint, fontSize:13, fontFamily:body, margin:"0 0 24px" }}>
              Clash locations pinned on the coordination plans. Colors match priority level.
            </p>

            {/* Priority legend for plans */}
            <div className="fade-up" style={{ display:"flex", gap:16, marginBottom:24, flexWrap:"wrap" }}>
              {Object.entries(PRI).map(([k, cfg]) => (
                <div key={k} style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:16, height:16, borderRadius:"50%", background:cfg.dot }}/>
                  <span style={{ fontSize:12, fontFamily:body, color:C.onSurfaceMid, fontWeight:600 }}>{k} — {cfg.title}</span>
                </div>
              ))}
            </div>

            {plansWithPins.map(fp => {
              const pinsOnPlan = clashes
                .filter(c => c.floorPlanId === fp.id && c.pinX != null)
                .map(c => ({ x: c.pinX, y: c.pinY, clashId: c.id, priority: c.priority }));

              return (
                <div key={fp.id} className="fade-up" style={{ background:C.surfaceLowest, borderRadius:14, overflow:"hidden", marginBottom:32, boxShadow:C.shadow }}>
                  {/* Plan header */}
                  <div style={{ padding:"14px 20px", background:C.navBg, display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:18 }}>🗺</span>
                    <span style={{ color:"#fff", fontWeight:800, fontSize:15, fontFamily:headline }}>{fp.name}</span>
                    <span style={{ color:"rgba(255,255,255,0.4)", fontSize:12, fontFamily:body }}>{pinsOnPlan.length} clash{pinsOnPlan.length!==1?"es":""} pinned</span>
                  </div>

                  {/* PDF with pins */}
                  <div style={{ padding:20, background:C.surfaceLow }}>
                    <PdfViewer url={fp.pdfUrl} pins={pinsOnPlan} />
                  </div>

                  {/* Pin legend */}
                  <div style={{ padding:"16px 20px" }}>
                    <div style={{ fontSize:10, color:C.onSurfaceFaint, fontFamily:body, letterSpacing:1.5, marginBottom:10 }}>PINNED CLASHES</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                      {pinsOnPlan.map(pin => {
                        const clash = clashes.find(c => c.id === pin.clashId);
                        const cfg   = PRI[pin.priority] || PRI.P1;
                        return (
                          <div key={pin.clashId} style={{ display:"flex", alignItems:"center", gap:8, background:cfg.bg, borderRadius:8, padding:"6px 12px" }}>
                            <div style={{ width:20, height:20, borderRadius:"50%", background:cfg.dot, display:"flex", alignItems:"center", justifyContent:"center" }}>
                              <span style={{ color:"#fff", fontSize:9, fontWeight:700, fontFamily:body }}>{pin.clashId.split("-")[1]||pin.clashId}</span>
                            </div>
                            <div>
                              <div style={{ fontSize:11, fontWeight:700, color:cfg.text, fontFamily:headline }}>{pin.clashId}</div>
                              {clash?.description && <div style={{ fontSize:10, color:cfg.text, fontFamily:body, opacity:.8 }}>{clash.description}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* RESOLUTION TABLE */}
        <div style={{ color:C.onSurface, fontWeight:800, fontSize:13, letterSpacing:2, margin:"40px 0 16px", display:"flex", alignItems:"center", gap:10 }} className="page-break fade-up">
          <span style={{ color:C.error, fontSize:22, fontFamily:headline }}>{plansWithPins.length > 0 ? "05" : "04"}</span>
          <span style={{ fontFamily:headline }}>RESOLUTION STATUS</span>
        </div>
        <div className="fade-up" style={{ borderRadius:14, overflow:"hidden", marginBottom:8, overflowX:"auto", boxShadow:C.shadow }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr>{["ID","Priority","Description","Assigned To","Due Date","Status","Notes"].map(h=><TH key={h}>{h}</TH>)}</tr></thead>
            <tbody>
              {clashes.map((c,i)=>(
                <tr key={c._key} style={{ background:i%2?C.surfaceLow:C.surfaceLowest }}>
                  <TD mono>{c.id}</TD><TD><PriBadge p={c.priority}/></TD>
                  <TD>{c.description}</TD><TD>{c.assignedTo||"—"}</TD>
                  <TD mono>{c.dueDate||"—"}</TD><TD><StatBadge s={c.status}/></TD>
                  <TD>{c.notes||"—"}</TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* FOOTER */}
        <div className="fade-up" style={{ marginTop:52, paddingTop:24, display:"flex", justifyContent:"space-between", alignItems:"center", color:C.onSurfaceFaint, fontSize:12 }}>
          <div style={{ width:48, height:3, background:C.primaryGrad, borderRadius:2, marginBottom:16, position:"absolute", marginTop:-24 }}/>
          <div style={{ paddingTop:8 }}>
            <div style={{ fontWeight:700, color:C.onSurface, fontSize:15, fontFamily:headline }}>{project.company}</div>
            <div style={{ fontFamily:body }}>{project.email} · {project.website}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontFamily:body }}>Prepared by <strong style={{ color:C.onSurface, fontFamily:headline }}>{project.coordinator}</strong></div>
            <div style={{ fontFamily:body, fontSize:11 }}>CONFIDENTIAL · Cycle {project.cycle}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// EDITOR SHELL
// ─────────────────────────────────────────────────────────────────
function Editor({ onLogout, projectId, onBack }) {
  const [data, setData]         = useState(()=>load(STORAGE_REPORT(projectId),{ project:DEFAULT_PROJECT, clashes:[] }));
  const [comments, setComments] = useState(()=>load(STORAGE_COMMENTS(projectId),[]));
  const [tab, setTab]           = useState("project");
  const [saved, setSaved]       = useState(false);
  const [sending, setSending]   = useState(false);

  const { project, clashes } = data;

  const persist         = useCallback(arg => {
    setData(prev => {
      const next = typeof arg === "function" ? arg(prev) : arg;
      save(STORAGE_REPORT(projectId), next);
      return next;
    });
  }, [projectId]);
  const persistComments = c => { setComments(c); save(STORAGE_COMMENTS(projectId), c); };
  const setProject      = (f,v) => persist({ ...data, project:{ ...project, [f]:v } });
  const setRecipients   = v     => persist({ ...data, project:{ ...project, recipients:v } });
  const setFloorPlans   = v     => persist({ ...data, project:{ ...project, floorPlans:v } });
  const addClash        = ()    => persist({ ...data, clashes:[...clashes, mkClash()] });
  const updClash        = (i,f,v) => persist(prev => { const c=[...prev.clashes]; c[i]={...c[i],[f]:v}; return { ...prev, clashes:c }; });
  const delClash        = i     => persist({ ...data, clashes:clashes.filter((_,j)=>j!==i) });
  const addComment      = c     => persistComments([...comments, c]);
  const manualSave      = ()    => { save(STORAGE_REPORT(projectId),data); setSaved(true); setTimeout(()=>setSaved(false),2000); };

  const floorPlans = project.floorPlans || [];

  const inp = {
    width:"100%", background:C.surfaceLow, borderRadius:8,
    padding:"10px 14px", color:C.onSurface, fontSize:13,
    fontFamily:body, border:"none",
  };
  const lbl = { color:C.onSurfaceFaint, fontSize:10, fontWeight:600, letterSpacing:1.5, display:"block", marginBottom:6, fontFamily:body };

  if (tab==="preview") return <ReportView project={project} clashes={clashes} comments={comments} onAddComment={addComment} onBack={()=>setTab("project")}/>;

  return (
    <div style={{ minHeight:"100vh", background:C.surface, fontFamily:body }}>
      <style>{GLOBAL_CSS}</style>
      {sending && <SendPanel project={project} clashes={clashes} onClose={()=>setSending(false)}/>}

      {/* NAV */}
      <div style={{ position:"sticky", top:0, zIndex:100, background:C.navBg, display:"flex", alignItems:"center", padding:"0 24px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"16px 24px 16px 0", marginRight:24 }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:C.error }}/>
          <span style={{ color:C.error, fontWeight:800, fontSize:11, letterSpacing:3, fontFamily:headline }}>BIM EDGE</span>
        </div>
        {[
          {k:"project",      l:"① Project & Recipients"},
          {k:"clashes",      l:`② Clashes (${clashes.length})`},
          {k:"comments_tab", l:`③ Comments (${comments.length})`},
          {k:"floorplans",   l:`④ Floor Plans (${floorPlans.length})`},
        ].map(({k,l})=>(
          <button key={k} onClick={()=>setTab(k)} style={{
            background:"none", border:"none",
            borderBottom:`2px solid ${tab===k?"#fff":"transparent"}`,
            color: tab===k ? "#fff" : "rgba(255,255,255,0.35)",
            padding:"18px 20px", cursor:"pointer",
            fontWeight: tab===k ? 700 : 400,
            fontSize:13, fontFamily:headline, transition:"all .2s",
          }}>{l}</button>
        ))}
        <div style={{ flex:1 }}/>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={manualSave} style={{
            background: saved ? "rgba(15,107,65,0.3)" : "rgba(255,255,255,0.08)",
            border:"none", borderRadius:8, padding:"8px 16px",
            color: saved ? "#6ee7b7" : "rgba(255,255,255,0.5)",
            cursor:"pointer", fontSize:12, fontFamily:body, transition:"all .3s",
          }}>{saved?"✓ Saved":"💾 Save"}</button>
          <button onClick={()=>setTab("preview")} style={{ background:"rgba(73,124,255,0.15)", border:"none", borderRadius:8, padding:"8px 18px", color:"#97b4ff", cursor:"pointer", fontWeight:600, fontSize:13, fontFamily:headline }}>👁 Preview</button>
          <button onClick={()=>setSending(true)} style={{ background:C.primaryGrad, border:"none", borderRadius:8, padding:"8px 20px", color:"#fff", fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:headline }}>📤 Send Report</button>
          <button onClick={onBack} style={{ background:"none", border:"none", borderRadius:8, padding:"8px 14px", color:"rgba(255,255,255,0.3)", cursor:"pointer", fontSize:12, fontFamily:body }}>← Projects</button>
          <button onClick={onLogout} style={{ background:"none", border:"none", borderRadius:8, padding:"8px 14px", color:"rgba(255,255,255,0.3)", cursor:"pointer", fontSize:12, fontFamily:body }}>Logout</button>
        </div>
      </div>

      <div style={{ maxWidth:880, margin:"0 auto", padding:"44px 24px" }}>

        {/* PROJECT TAB */}
        {tab==="project" && (
          <div className="fade-up">
            <h2 style={{ color:C.onSurface, fontSize:28, fontWeight:800, margin:"0 0 6px", letterSpacing:-0.5, fontFamily:headline }}>Project Information</h2>
            <p style={{ color:C.onSurfaceFaint, fontSize:13, fontFamily:body, margin:"0 0 32px" }}>Cover page & footer data. All fields auto-save.</p>

            <div style={{ background:C.surfaceLowest, borderRadius:16, padding:28, marginBottom:28, boxShadow:C.shadow }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
                {[
                  ["PROJECT NAME","name","NAMDAR 101 — Tower"],
                  ["CLIENT / FIRM","client","Behar Font & Partners"],
                  ["REPORT DATE","date","","date"],
                  ["CYCLE NUMBER","cycle","1"],
                  ["BIM COORDINATOR","coordinator","Julio Borrego"],
                  ["COMPANY","company","BIM Edge Solutions Corp."],
                  ["EMAIL","email","julio@bimedgesolutions.com"],
                  ["WEBSITE","website","www.bimedgesolutions.com"],
                ].map(([label,field,ph,type])=>(
                  <div key={field}>
                    <label style={lbl}>{label}</label>
                    <input type={type||"text"} value={project[field]} placeholder={ph} onChange={e=>setProject(field,e.target.value)} style={inp}/>
                  </div>
                ))}
                <div style={{ gridColumn:"span 2" }}>
                  <label style={lbl}>MODELS REVIEWED</label>
                  <input value={project.modelsReviewed} onChange={e=>setProject("modelsReviewed",e.target.value)} style={inp} placeholder="ARQ, STR, MEP-M, MEP-P, MEP-E"/>
                </div>
                <div style={{ gridColumn:"span 2" }}>
                  <label style={lbl}>GENERAL OBSERVATIONS</label>
                  <textarea value={project.observations} rows={4} onChange={e=>setProject("observations",e.target.value)} style={{ ...inp, resize:"vertical" }} placeholder="Coordination findings, model quality, recurring issues…"/>
                </div>
              </div>
            </div>

            <div style={{ background:C.surfaceLowest, borderRadius:16, padding:28, boxShadow:C.shadow }}>
              <h3 style={{ color:C.onSurface, fontSize:17, fontWeight:700, margin:"0 0 6px", fontFamily:headline }}>Report Recipients</h3>
              <p style={{ color:C.onSurfaceFaint, fontSize:13, fontFamily:body, margin:"0 0 20px" }}>Add one email per specialty. All will receive the report link when you click Send.</p>
              <RecipientsPanel recipients={project.recipients||[]} onChange={setRecipients}/>
            </div>
          </div>
        )}

        {/* CLASHES TAB */}
        {tab==="clashes" && (
          <div className="fade-up">
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
              <h2 style={{ color:C.onSurface, fontSize:28, fontWeight:800, margin:0, letterSpacing:-0.5, fontFamily:headline }}>Clash Log</h2>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <PriorityLegend/>
                <button onClick={addClash} style={{ background:C.primaryGrad, border:"none", borderRadius:10, padding:"10px 24px", color:"#fff", fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:headline }}>+ Add Clash</button>
              </div>
            </div>
            <p style={{ color:C.onSurfaceFaint, fontSize:13, fontFamily:body, margin:"0 0 24px" }}>{clashes.length} clash{clashes.length!==1?"es":""} · screenshots auto-fit · drag & drop supported</p>

            {clashes.length===0 && (
              <div style={{ background:C.surfaceLowest, borderRadius:16, padding:"60px 40px", textAlign:"center", boxShadow:C.shadow }}>
                <div style={{ fontSize:44, marginBottom:12 }}>⚡</div>
                <p style={{ color:C.onSurfaceFaint, fontFamily:body }}>No clashes yet. Click "+ Add Clash" to start.</p>
              </div>
            )}
            {clashes.map((c,i)=>(
              <ClashCard
                key={c._key} clash={c} idx={i}
                onChange={(f,v)=>updClash(i,f,v)}
                onRemove={()=>delClash(i)}
                comments={comments}
                floorPlans={floorPlans}
              />
            ))}
            {clashes.length>0 && (
              <button onClick={addClash} style={{ width:"100%", background:C.surfaceLowest, borderRadius:10, padding:16, color:C.onSurfaceFaint, cursor:"pointer", fontSize:14, fontFamily:headline, marginTop:4, boxShadow:C.shadow, border:"none" }}>+ Add Another Clash</button>
            )}
          </div>
        )}

        {/* COMMENTS TAB */}
        {tab==="comments_tab" && (
          <div className="fade-up">
            <h2 style={{ color:C.onSurface, fontSize:28, fontWeight:800, margin:"0 0 6px", letterSpacing:-0.5, fontFamily:headline }}>Client Comments</h2>
            <p style={{ color:C.onSurfaceFaint, fontSize:13, fontFamily:body, margin:"0 0 28px" }}>Comments left by recipients on each clash card.</p>
            {comments.length===0 && (
              <div style={{ background:C.surfaceLowest, borderRadius:16, padding:"60px 40px", textAlign:"center", boxShadow:C.shadow }}>
                <div style={{ fontSize:44, marginBottom:12 }}>💬</div>
                <p style={{ color:C.onSurfaceFaint, fontFamily:body }}>No comments yet. They appear here once clients leave feedback on the report.</p>
              </div>
            )}
            {clashes.map(c=>{
              const mine=comments.filter(cm=>cm.clashKey===c._key);
              if(!mine.length) return null;
              return (
                <div key={c._key} style={{ marginBottom:28 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                    <PriBadge p={c.priority}/>
                    <span style={{ color:C.onSurface, fontWeight:700, fontFamily:headline }}>{c.id} — {c.description}</span>
                    <Tag color={C.onPrimaryFixed}>{mine.length} comment{mine.length!==1?"s":""}</Tag>
                  </div>
                  {mine.map(cm=>(
                    <div key={cm.id} className="slide-in" style={{ background:C.surfaceLowest, borderRadius:12, padding:"14px 18px", marginBottom:8, boxShadow:C.shadow }}>
                      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:8 }}>
                        <div style={{ width:34, height:34, borderRadius:"50%", background:C.surfaceHigh, display:"flex", alignItems:"center", justifyContent:"center", color:C.onPrimaryFixed, fontWeight:800, fontSize:14 }}>{cm.author[0].toUpperCase()}</div>
                        <div>
                          <div style={{ color:C.onSurface, fontWeight:700, fontSize:14, fontFamily:headline }}>{cm.author}</div>
                          <div style={{ color:C.onSurfaceFaint, fontSize:11, fontFamily:body }}>{cm.specialty} · {new Date(cm.ts).toLocaleDateString()}</div>
                        </div>
                        <div style={{ flex:1 }}/>
                        <button onClick={()=>persistComments(comments.filter(x=>x.id!==cm.id))} style={{ background:"none", border:"none", color:C.onSurfaceFaint, cursor:"pointer", fontSize:16 }} title="Delete comment">🗑</button>
                      </div>
                      <p style={{ color:C.onSurfaceMid, fontSize:14, margin:0, lineHeight:1.65, paddingLeft:44 }}>{cm.text}</p>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* FLOOR PLANS TAB */}
        {tab==="floorplans" && (
          <FloorPlansTab floorPlans={floorPlans} onChange={setFloorPlans} />
        )}

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// CLIENT VIEW — loads report from Supabase by ID
// ─────────────────────────────────────────────────────────────────
function ClientView({ reportId }) {
  const [state, setState]     = useState("loading");
  const [project, setProject] = useState(null);
  const [clashes, setClashes] = useState([]);
  const [comments, setComments] = useState([]);

  useEffect(() => {
    async function load() {
      const { data: rep, error: repErr } = await supabase
        .from("reports").select("*").eq("id", reportId).single();
      if (repErr || !rep) { setState("error"); return; }

      const { data: coms } = await supabase
        .from("comments").select("*").eq("report_id", reportId);

      setProject(rep.project);
      setClashes(rep.clashes);
      setComments((coms||[]).map(c=>({
        id: c.id, clashKey: c.clash_id,
        author: c.author, specialty: c.specialty,
        text: c.text, ts: new Date(c.created_at).getTime(),
      })));
      setState("ready");
    }
    load();
  }, [reportId]);

  const addComment = c => setComments(prev => [...prev, c]);

  if (state==="loading") return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:C.surface, fontFamily:body }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:48, animation:"pulse 1s infinite", marginBottom:16 }}>⏳</div>
        <p style={{ color:C.onSurfaceFaint }}>Loading report…</p>
      </div>
    </div>
  );

  if (state==="error") return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:C.surface, fontFamily:body }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:16 }}>❌</div>
        <p style={{ color:C.error, fontFamily:body }}>Report not found or expired.</p>
      </div>
    </div>
  );

  return <ReportView project={project} clashes={clashes} comments={comments} onAddComment={addComment} reportId={reportId}/>;
}

// ─────────────────────────────────────────────────────────────────
// PROJECT SELECTOR
// ─────────────────────────────────────────────────────────────────
function ProjectSelector({ onSelect, onLogout }) {
  const [projects, setProjects] = useState(() => {
    const existing = load(STORAGE_PROJECTS, []);
    // Migrate old single-project storage if exists and no projects yet
    if (existing.length === 0) {
      const oldData = load("bim_report_v2", null);
      if (oldData && (oldData.project?.name || oldData.clashes?.length > 0)) {
        const migrated = { id: "migrated", name: oldData.project?.name || "My Project", createdAt: new Date().toISOString() };
        save(STORAGE_REPORT("migrated"), oldData);
        const oldComments = load("bim_comments_v2", []);
        save(STORAGE_COMMENTS("migrated"), oldComments);
        save(STORAGE_PROJECTS, [migrated]);
        return [migrated];
      }
    }
    return existing;
  });
  const [newName, setNewName]   = useState("");
  const [confirm, setConfirm]   = useState(null); // id to delete

  const saveProjects = p => { setProjects(p); save(STORAGE_PROJECTS, p); };

  const createProject = () => {
    const name = newName.trim();
    if (!name) return;
    const p = { id: Date.now().toString(36), name, createdAt: new Date().toISOString() };
    const next = [...projects, p];
    saveProjects(next);
    setNewName("");
    onSelect(p.id);
  };

  const deleteProject = id => {
    try { localStorage.removeItem(STORAGE_REPORT(id)); } catch {}
    try { localStorage.removeItem(STORAGE_COMMENTS(id)); } catch {}
    saveProjects(projects.filter(p => p.id !== id));
    setConfirm(null);
  };

  return (
    <div style={{ minHeight:"100vh", background:C.surface, fontFamily:body }}>
      <style>{GLOBAL_CSS}</style>

      {/* NAV */}
      <div style={{ background:C.navBg, display:"flex", alignItems:"center", padding:"0 32px", height:56 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:C.error }}/>
          <span style={{ color:C.error, fontWeight:800, fontSize:11, letterSpacing:3, fontFamily:headline }}>BIM EDGE</span>
        </div>
        <div style={{ flex:1 }}/>
        <button onClick={onLogout} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.3)", cursor:"pointer", fontSize:12, fontFamily:body }}>Logout</button>
      </div>

      <div style={{ maxWidth:640, margin:"0 auto", padding:"48px 24px" }}>
        <h2 style={{ fontFamily:headline, fontSize:28, fontWeight:800, color:C.onSurface, margin:"0 0 6px" }}>Projects</h2>
        <p style={{ color:C.onSurfaceFaint, fontSize:13, fontFamily:body, margin:"0 0 32px" }}>Select a project to edit or create a new one.</p>

        {/* Create new */}
        <div style={{ display:"flex", gap:10, marginBottom:32 }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key==="Enter" && createProject()}
            placeholder="New project name…"
            style={{ flex:1, background:C.surfaceLowest, border:`1px solid ${C.surfaceHigh}`, borderRadius:10, padding:"11px 16px", fontSize:14, color:C.onSurface, fontFamily:body }}
          />
          <button
            onClick={createProject}
            disabled={!newName.trim()}
            style={{ background:newName.trim()?C.primaryGrad:C.surfaceHigh, border:"none", borderRadius:10, padding:"11px 24px", color:newName.trim()?"#fff":C.onSurfaceFaint, fontWeight:800, fontSize:14, cursor:newName.trim()?"pointer":"default", fontFamily:headline }}
          >
            + Create
          </button>
        </div>

        {/* Projects list */}
        {projects.length === 0 ? (
          <div style={{ background:C.surfaceLowest, borderRadius:16, padding:"60px 40px", textAlign:"center", boxShadow:C.shadow }}>
            <div style={{ fontSize:44, marginBottom:12 }}>📁</div>
            <p style={{ color:C.onSurfaceFaint, fontFamily:body }}>No projects yet. Create one above.</p>
          </div>
        ) : (
          projects.map(p => (
            <div key={p.id} style={{ background:C.surfaceLowest, borderRadius:14, padding:"18px 24px", marginBottom:10, boxShadow:C.shadow, display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:15, fontFamily:headline, color:C.onSurface }}>{p.name}</div>
                <div style={{ fontSize:11, color:C.onSurfaceFaint, fontFamily:body, marginTop:2 }}>
                  Created {new Date(p.createdAt).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => onSelect(p.id)}
                style={{ background:C.primaryGrad, border:"none", borderRadius:8, padding:"9px 20px", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:headline }}
              >
                Open →
              </button>
              {confirm === p.id ? (
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={() => deleteProject(p.id)} style={{ background:C.error, border:"none", borderRadius:8, padding:"9px 14px", color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:body }}>Delete</button>
                  <button onClick={() => setConfirm(null)} style={{ background:C.surfaceLow, border:"none", borderRadius:8, padding:"9px 14px", color:C.onSurfaceMid, fontWeight:600, fontSize:12, cursor:"pointer", fontFamily:body }}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirm(p.id)} style={{ background:"none", border:`1px solid ${C.surfaceHigh}`, borderRadius:8, padding:"9px 14px", color:C.error, fontWeight:600, fontSize:12, cursor:"pointer", fontFamily:body }}>🗑</button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ADMIN SHELL — wraps auth + editor
// ─────────────────────────────────────────────────────────────────
function AdminShell() {
  const [authed, setAuthed]         = useState(()=>{ try{ return sessionStorage.getItem("bim_authed")==="1"; }catch{ return false; } });
  const [projectId, setProjectId]   = useState(null);
  const login  = ()=>{ try{ sessionStorage.setItem("bim_authed","1"); }catch{} setAuthed(true); };
  const logout = ()=>{ try{ sessionStorage.removeItem("bim_authed"); }catch{} setAuthed(false); setProjectId(null); };
  if (!authed) return <Login onLogin={login}/>;
  if (!projectId) return <ProjectSelector onSelect={setProjectId} onLogout={logout}/>;
  return <Editor onLogout={logout} projectId={projectId} onBack={() => setProjectId(null)}/>;
}

// ─────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────
export default function App() {
  const params = new URLSearchParams(window.location.search);
  const reportId = params.get("id");
  if (reportId) return <ClientView reportId={reportId}/>;
  return <AdminShell/>;
}
