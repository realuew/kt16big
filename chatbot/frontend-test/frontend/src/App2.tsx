import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
// (선택) 마크다운 렌더링을 원하면 아래 주석 해제 후 패키지 설치
// import ReactMarkdown from "react-markdown";
// import remarkGfm from "remark-gfm";

// --------------------------------------------------
// ChatGPT-처럼 보이는 UI로 전면 개편한 App (1).tsx
// - 기존 me/bot 채팅 로직 유지
// - 상단 헤더 + 좌측 사이드바(대화 목록) + 중앙 채팅 영역
// - Enter 전송, Shift+Enter 줄바꿈
// - 메시지 복사, 로딩 중 중단(Stop)
// - (선택) Markdown 렌더링 지원
// - 로컬스토리지에 최근 대화 저장
// --------------------------------------------------

export default function App() {
  return (
    <BrowserRouter>
      <GlobalStyles />
      <Routes>
        <Route path="/*" element={<ChatLayout />} />
      </Routes>
    </BrowserRouter>
  );
}

// -------------------- 전역 스타일 --------------------
function GlobalStyles() {
  const css = `
    :root{
      --bg:#f6f7f9; --panel:#ffffff; --border:#e5e7eb; --text:#0b0c10; --muted:#a8adbd;
      --brand:#10b981; --brand-ink:#053b2f; --danger:#ef4444;
      --user:#10b981; --bot:#111827;
      --radius:14px;
    }
    *{box-sizing:border-box}
    html,body,#root{height:100%}
    body{margin:0; background:var(--bg); color:var(--text);
      font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,
      "Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic","맑은 고딕",sans-serif;}

    .layout{display:grid; grid-template-columns:260px 1fr; height:100vh}
    .sidebar{border-right:1px solid var(--border); background:#fbfbfc; display:flex; flex-direction:column}
    .sidebar .top{padding:16px; border-bottom:1px solid var(--border); display:flex; gap:8px}
    .sidebar .new{flex:1; padding:10px 12px; border-radius:10px; border:1px solid var(--border); background:var(--panel); cursor:pointer}
    .sidebar .list{flex:1; overflow:auto; padding:8px}
    .sidebar .item{padding:10px 12px; border-radius:10px; cursor:pointer; border:1px solid transparent}
    .sidebar .item:hover{background:#f2f3f5}
    .sidebar .item.active{background:#ecfdf5; border-color:#bbf7d0}

    .main{display:flex; flex-direction:column; height:100vh}
    .header{display:flex; align-items:center; justify-content:space-between; gap:8px; padding:12px 16px; border-bottom:1px solid var(--border); background:var(--panel);}
    .title{font-weight:700}

    .chat-wrap{flex:1; display:flex; justify-content:center; overflow:auto}
    .chat{width:min(900px, 100%); padding:24px 16px 40px; /* 기존 120px에서 줄임 */}

    .msg-row{display:flex; gap:12px; margin:16px 0}
    .avatar{width:28px; height:28px; border-radius:999px; display:flex; align-items:center; justify-content:center; font-weight:700}
    .avatar.bot{background:#111827; color:#fff}
    .avatar.me{background:#10b981; color:#052e25}

    .bubble{flex:1; background:var(--panel); border:1px solid var(--border); border-radius:var(--radius); padding:14px 16px; white-space:pre-wrap; line-height:1.6}
    .bubble pre{background:#0b1020; color:#e6e6ef; padding:12px; border-radius:10px; overflow:auto}
    .bubble code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
    .row-meta{margin-top:6px; font-size:12px; color:var(--muted)}

    .tools{display:flex; gap:8px; margin-top:8px}
    .tool-btn{font-size:12px; padding:6px 8px; border-radius:8px; border:1px solid var(--border); background:#fff; cursor:pointer}

    .composer{position:sticky; bottom:0; background:linear-gradient(180deg, rgba(246,247,249,0), rgba(246,247,249,1) 40%);} 
    .composer .inner{max-width:900px; margin:0 auto; padding:12px 16px 20px;}
    .input-row{display:flex; gap:10px; align-items:flex-end}
    .field{flex:1; min-height:44px; max-height:200px; resize:vertical; padding:12px 14px; border-radius:12px; border:1px solid var(--border); background:#fff; font-size:14px}
    .send{padding:12px 14px; border-radius:12px; border:none; background:var(--brand); color:#052e25; font-weight:700; cursor:pointer}
    .send:disabled{opacity:.6; cursor:default}
    .kbd{font-family:ui-monospace,SFMono-Regular,Menlo,monospace; padding:2px 6px; border-radius:6px; border:1px solid var(--border); background:#fff; color:#6b7280; font-size:12px}

    .typing{display:inline-flex; gap:6px}
    .dot{width:6px; height:6px; background:#9ca3af; border-radius:999px; animation:blink 1.2s infinite}
    .dot:nth-child(2){animation-delay:.2s}
    .dot:nth-child(3){animation-delay:.4s}
    @keyframes blink{0%{opacity:.2} 20%{opacity:1} 100%{opacity:.2}}

    @media (max-width: 920px){
      .layout{grid-template-columns:1fr}
      .sidebar{display:none}
      .composer{left:0}
    }
  `;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

// -------------------- 타입 & 유틸 --------------------
interface ChatMsg { id: string; role: "user" | "bot"; text: string; time: string; }
const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
const newId = () => (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()));

// -------------------- 메인 레이아웃 --------------------
function ChatLayout(){
  const [threads, setThreads] = useState<ThreadSummary[]>(() => loadThreads());
  const [activeId, setActiveId] = useState<string>(() => threads[0]?.id ?? createNewThread(setThreads));

  return (
    <div className="layout">
      <Sidebar
        threads={threads}
        activeId={activeId}
        onNew={() => setActiveId(createNewThread(setThreads))}
        onSelect={(id) => setActiveId(id)}
        onRename={(id, title) => renameThread(id, title, setThreads)}
      />
      <ChatArea
        threadId={activeId}
        onTitle={(title) => renameThread(activeId, title, setThreads)}
        onDelete={() => { deleteThread(activeId, setThreads); const next = loadThreads()[0]?.id ?? createNewThread(setThreads); setActiveId(next); }}
      />
    </div>
  );
}

// -------------------- 사이드바 --------------------
interface ThreadSummary{ id: string; title: string; updatedAt: number }
function Sidebar({ threads, activeId, onNew, onSelect, onRename }:{ threads:ThreadSummary[]; activeId:string; onNew:()=>void; onSelect:(id:string)=>void; onRename:(id:string,title:string)=>void }){
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState<string>("");

  function startEdit(id:string, current:string){
    setEditingId(id);
    setTempTitle(current);
  }
  function commitEdit(){
    if(editingId){
      onRename(editingId, tempTitle.trim() || "새 대화");
      setEditingId(null);
    }
  }

  return (
    <aside className="sidebar" aria-label="대화 목록">
      <div className="top">
        <button className="new" onClick={onNew}>+ 새 대화</button>
      </div>
      <div className="list">
        {threads.length===0 && <div style={{padding:12, color:'#6b7280'}}>대화를 시작해 보세요.</div>}
        {threads.map(t => (
          <div key={t.id} className={`item ${t.id===activeId? 'active':''}`} onClick={() => onSelect(t.id)}>
            {editingId === t.id ? (
              <input className="title-input" value={tempTitle} autoFocus onChange={(e)=>setTempTitle(e.target.value)} onBlur={commitEdit} onKeyDown={(e)=>{if(e.key==='Enter') commitEdit();}} />
            ):(
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div style={{fontWeight:600, fontSize:14}}>{t.title}</div>
                <button className="tool-btn" style={{fontSize:10, padding:'2px 4px'}} onClick={(e)=>{e.stopPropagation(); startEdit(t.id, t.title)}}>✎</button>
              </div>
            )}
            <div style={{fontSize:12, color:'#6b7280', marginTop:4}}>{new Date(t.updatedAt).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}

// -------------------- 채팅 영역 --------------------
function ChatArea({ threadId, onTitle, onDelete }:{ threadId:string; onTitle:(t:string)=>void; onDelete:()=>void }){
  const [msgs, setMsgs] = useState<ChatMsg[]>(() => loadMsgs(threadId));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => { setMsgs(loadMsgs(threadId)); }, [threadId]);
  useEffect(() => { saveMsgs(threadId, msgs); if(msgs.length===1 && msgs[0].role==='bot'){ onTitle("새 대화"); } else { const t = summarizeTitle(msgs); if(t) onTitle(t); }}, [msgs, threadId]);
  useEffect(() => { const el = listRef.current; if(!el) return; el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, [msgs.length, loading]);

  const api = useMemo(() => axios.create({ baseURL: "/api", timeout: 20000, headers: { "Content-Type": "application/json" } }), []);
  const USE_NETWORK = true; // 서버 준비되면 true

  const canSend = input.trim().length > 0 && !loading;
  const push = (m: ChatMsg) => setMsgs(prev => [...prev, m]);
  const pushUser = (text: string) => push({ id: newId(), role: "user", text, time: nowHM() });
  const pushBot  = (text: string) => push({ id: newId(), role: "bot",  text, time: nowHM() });

  async function handleSend(){
    if(!canSend) return;
    const q = input.trim(); setInput(""); pushUser(q); setLoading(true);
    try {
      if (USE_NETWORK) {
        const { data } = await api.post("/ask", { question: q, session_id: threadId });
        const answer = (data && (data.answer ?? data.result ?? data.message)) ?? "서버 응답이 비어있습니다.";
        pushBot(String(answer));
      } else {
        await new Promise(r => setTimeout(r, 300));
        pushBot(fakeAnswer(q));
      }
    } catch (err:any) {
      const msg = err?.response?.data?.detail || err?.message || "요청 중 오류가 발생했습니다.";
      pushBot(`요청 실패: ${msg}`);
    } finally {
      setLoading(false); textareaRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>){
    if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); handleSend(); }
  }

  function handleCopy(text:string){
    navigator.clipboard?.writeText(text);
  }

  function handleStop(){ setLoading(false); }

  return (
    <div className="main">
      <div className="header">
        <div className="title">ChatGPT 스타일 챗봇</div>
        <div style={{display:'flex', gap:8}}>
          <button className="tool-btn" onClick={() => onDelete()}>대화 삭제</button>
        </div>
      </div>

      <div className="chat-wrap">
        <div ref={listRef} className="chat" role="log" aria-live="polite" aria-relevant="additions">
          {msgs.map(m => (
            <div key={m.id} className="msg-row">
              <div className={`avatar ${m.role==='bot'?'bot':'me'}`}>{m.role==='bot'? 'B': 'M'}</div>
              <div style={{flex:1}}>
                <div className="bubble">
                  {/* 마크다운 사용 시 아래 교체: <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown> */}
                  {m.text}
                </div>
                <div className="tools">
                  <button className="tool-btn" onClick={() => handleCopy(m.text)}>복사</button>
                </div>
                <div className="row-meta">{m.time}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="msg-row">
              <div className="avatar bot">B</div>
              <div style={{flex:1}}>
                <div className="bubble"><span className="typing"><span className="dot"/><span className="dot"/><span className="dot"/></span></div>
                <div className="row-meta">입력 중...</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 입력부 */}
      <div className="composer" role="form" aria-label="메시지 입력">
        <div className="inner">
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:8, color:'#6b7280', fontSize:12}}>
            <div><span className="kbd">Enter</span> 전송 · <span className="kbd">Shift</span>+<span className="kbd">Enter</span> 줄바꿈</div>
            {loading && <button className="tool-btn" onClick={handleStop}>중단</button>}
          </div>
          <div className="input-row">
            <textarea ref={textareaRef} className="field" placeholder="메시지를 입력하세요" value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKeyDown} />
            <button className="send" disabled={!canSend} onClick={handleSend} aria-label="보내기">보내기</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------- 로컬 저장 도구 --------------------
function storeKey(){ return "chatgpt-ui-threads-v1"; }
function loadThreads(): ThreadSummary[]{
  const raw = localStorage.getItem(storeKey());
  if(!raw) return [];
  try { const parsed = JSON.parse(raw) as { [id:string]: { title:string; updatedAt:number; msgs:ChatMsg[] } }; return Object.keys(parsed).map(id => ({ id, title: parsed[id].title, updatedAt: parsed[id].updatedAt })).sort((a,b)=>b.updatedAt-a.updatedAt); } catch { return []; }
}
function loadMsgs(id:string): ChatMsg[]{
  const raw = localStorage.getItem(storeKey());
  if(!raw) return [ { id:newId(), role:'bot', text:'안녕하세요! 무엇을 도와드릴까요?', time:nowHM() } ];
  try { const parsed = JSON.parse(raw) as { [id:string]: { title:string; updatedAt:number; msgs:ChatMsg[] } }; return parsed[id]?.msgs ?? [ { id:newId(), role:'bot', text:'안녕하세요! 무엇을 도와드릴까요?', time:nowHM() } ]; } catch { return [ { id:newId(), role:'bot', text:'안녕하세요! 무엇을 도와드릴까요?', time:nowHM() } ]; }
}
function saveMsgs(id:string, msgs:ChatMsg[]){
  const raw = localStorage.getItem(storeKey());
  const db = raw? JSON.parse(raw) : {};
  const title = summarizeTitle(msgs) || db[id]?.title || '새 대화';
  db[id] = { title, updatedAt: Date.now(), msgs };
  localStorage.setItem(storeKey(), JSON.stringify(db));
}
function renameThread(id:string, title:string, setThreads:(updater:ThreadSummary[])=>void){
  const raw = localStorage.getItem(storeKey());
  if(!raw) return;
  const db = JSON.parse(raw);
  if(db[id]){ db[id].title = title; localStorage.setItem(storeKey(), JSON.stringify(db)); }
  setThreads(loadThreads());
}
function deleteThread(id:string, setThreads:(updater:ThreadSummary[])=>void){
  const raw = localStorage.getItem(storeKey());
  if(!raw) return;
  const db = JSON.parse(raw);
  delete db[id];
  localStorage.setItem(storeKey(), JSON.stringify(db));
  setThreads(loadThreads());
}
function createNewThread(setThreads:(updater:ThreadSummary[])=>void){
  const id = newId();
  const dbRaw = localStorage.getItem(storeKey());
  const db = dbRaw? JSON.parse(dbRaw) : {};
  db[id] = { title: '새 대화', updatedAt: Date.now(), msgs: [ { id:newId(), role:'bot', text:'안녕하세요! 무엇을 도와드릴까요?', time:nowHM() } ] };
  localStorage.setItem(storeKey(), JSON.stringify(db));
  setThreads(loadThreads());
  return id;
}
function summarizeTitle(msgs:ChatMsg[]){
  const firstUser = msgs.find(m=>m.role==='user')?.text?.trim();
  if(!firstUser) return '';
  return firstUser.length>18? firstUser.slice(0,18)+"…" : firstUser;
}

// -------------------- 스텁 응답 --------------------
function fakeAnswer(q:string){
  return `질문: ${q}\n\n여기는 스텁 응답입니다. 서버 연동 후에는 실제 답변이 표시됩니다.`;
}
