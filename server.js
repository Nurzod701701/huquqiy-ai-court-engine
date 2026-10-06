import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = Number(process.env.PORT || 10000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const sessions = new Map();
const MAX_TURNS = 30;

function txt(v, n=10000){ return String(v ?? "").replace(/\0/g,"").trim().slice(0,n); }
function lang(v){ v=txt(v,10).toLowerCase(); return v==="ru"?"ru":v==="en"?"en":"uz"; }

function session(id){
  id=txt(id,100)||"anonymous";
  if(!sessions.has(id)) sessions.set(id,{createdAt:Date.now(),turns:[]});
  return sessions.get(id);
}
function remember(s,t){ s.turns.push(t); if(s.turns.length>MAX_TURNS)s.turns=s.turns.slice(-MAX_TURNS); }

function action(q){
  const t=txt(q,5000).toLowerCase();
  if(t.includes("e'tiroz")||t.includes("e’tiroz")||t.includes("возраж")||t.includes("objection")) return "OBJECTION";
  if(t.includes("iltimosnoma")||t.includes("ходатай")||t.includes("motion")) return "MOTION";
  if(t.includes("savolim yo'q")||t.includes("savolim yo‘q")||t.includes("вопросов нет")||t.includes("no further questions")) return "END";
  if(t.includes("?")) return "QUESTION";
  return "STATEMENT";
}

function languageRule(l){
 if(l==="ru") return "Отвечай ТОЛЬКО на русском языке. Даже если студент пишет на другом языке. Не изменяй факты, имена, даты и суммы.";
 if(l==="en") return "Respond ONLY in English, even if the student writes in another language. Never alter case facts, names, dates or amounts.";
 return "FAQAT o‘zbek tilida lotin yozuvida javob ber. Talaba boshqa tilda yozsa ham javob o‘zbekcha bo‘lsin. Fakt, ism, sana va summalarni o‘zgartirma.";
}

function fallback(l,a){
 const x={
  uz:{end:"Boshqa savolim yo‘q.",endj:"Sud buni qayd etib, jarayonni davom ettiradi.",obj:"E’tiroz ko‘rib chiqish uchun qabul qilindi.",objj:"Sud e’tirozning aniq protsessual asosini ko‘rsatishni so‘raydi.",mot:"Iltimosnoma qabul qilindi.",motj:"Sud boshqa ishtirokchilarning fikrini eshitadi.",ans:"Javob faqat kazusdagi mavjud fakt va dalillar asosida berilishi mumkin.",judge:"Sud ish materiallari doirasida davom etishni so‘raydi."},
  ru:{end:"У меня больше нет вопросов.",endj:"Суд принимает это к сведению и продолжает процесс.",obj:"Возражение принято к рассмотрению.",objj:"Суд просит указать конкретное процессуальное основание.",mot:"Ходатайство принято.",motj:"Суд выслушает мнение других участников.",ans:"Ответ может основываться только на имеющихся фактах и доказательствах дела.",judge:"Суд просит продолжить в пределах материалов дела."},
  en:{end:"I have no further questions.",endj:"The court notes this and proceeds.",obj:"The objection is taken under consideration.",objj:"The court asks for the specific procedural basis.",mot:"The motion is received.",motj:"The court will hear the other participants.",ans:"The response may rely only on the facts and evidence contained in the case.",judge:"The court asks the participant to remain within the case record."}
 }[l];
 if(a==="END")return{kind:"END",target:null,answer:x.end,judgeReaction:x.endj,continueStage:false};
 if(a==="OBJECTION")return{kind:"OBJECTION",target:"Sudya",answer:x.obj,judgeReaction:x.objj,continueStage:true};
 if(a==="MOTION")return{kind:"MOTION",target:"Sudya",answer:x.mot,judgeReaction:x.motj,continueStage:true};
 return{kind:a,target:null,answer:x.ans,judgeReaction:x.judge,continueStage:true};
}

function mem(s){
 return s.turns.slice(-12).map((t,i)=>`${i+1}. Talaba: ${t.student}\nJavob: ${t.answer}\nSudya: ${t.judgeReaction||"-"}`).join("\n\n")||"Oldingi dialog yo‘q.";
}
function people(p){
 if(!p||typeof p!=="object")return "Ko‘rsatilmagan";
 return Object.entries(p).map(([k,v])=>`${txt(k,100)}: ${txt(v,300)}`).join("\n");
}
function caseData(b){
 const c=b.caseData||{};
 return{title:txt(c.title,500),facts:txt(c.facts,20000),evidence:txt(c.evidenceDossier,20000),people:c.people||{}};
}
function systemPrompt(l){return `SEN HUQUQIY AI PROFESSIONAL SUD SIMULYATORINING DINAMIK SUD DVIGATELISAN.
Bu o‘quv simulyatsiyasi.
${languageRule(l)}

QAT'IY QOIDALAR:
1. Faqat yuborilgan CASE FACTS, EVIDENCE, PEOPLE va MEMORYdan foydalan.
2. Yangi fakt, dalil, guvoh, ekspertiza, sana, hujjat, audio/video yoki alibi o‘ylab topma.
3. Talabaning fikri sud ishtirokchilarining reaksiyasini o‘zgartirishi mumkin, ammo tarixiy faktlarni o‘zgartirmaydi.
4. Guvoh faqat o‘zi biladigan holat haqida gapiradi; bilmasa, bilmasligini aytadi.
5. Ekspert faqat xulosa doirasida javob beradi va aybdorlik bo‘yicha hukm chiqarmaydi.
6. Sudya neytral bo‘ladi va talabaning o‘rniga ishni hal qilmaydi.
7. Prokuror va himoyachi bir xil faktlarni turlicha huquqiy talqin qilishi mumkin.
8. Oldingi MEMORYni eslab qol va asossiz ravishda oldingi javobga zid gapirma.
9. Talabaga yashirin huquqiy muammolarni sud davomida tayyor hint sifatida aytma.
10. Savolga sud zalidagi tabiiy, professional va qisqa nutq bilan javob ber.
11. "Boshqa savolim yo‘q" bo‘lsa END; e'tiroz bo‘lsa OBJECTION; iltimosnoma bo‘lsa MOTION; savol bo‘lsa QUESTION; fikr/pozitsiya bo‘lsa STATEMENT.
12. FAQAT JSON qaytar.

{"kind":"QUESTION|END|OBJECTION|MOTION|STATEMENT","target":"Sudlanuvchi|Guvoh|Jabrlanuvchi|Ekspert|Sudya|Prokuror|Himoyachi|null","answer":"...","judgeReaction":"...","continueStage":true}`}

function parseJSON(raw){
 raw=txt(raw,20000);
 try{return JSON.parse(raw)}catch{}
 const f=raw.match(/```(?:json)?\s*([\s\S]*?)```/i); if(f){try{return JSON.parse(f[1])}catch{}}
 const a=raw.indexOf("{"),z=raw.lastIndexOf("}"); if(a>=0&&z>a)return JSON.parse(raw.slice(a,z+1));
 throw new Error("Gemini JSON qaytarmadi");
}

async function courtTurn(b){
 const l=lang(b.language), s=session(b.sessionId), q=txt(b.question||b.prompt,6000), a=action(q), c=caseData(b);
 if(!q) throw new Error("Savol yoki pozitsiya kiritilmagan");
 if(!ai)return{...fallback(l,a),provider:"local-fallback",language:l,warning:"GEMINI_API_KEY is not configured"};

 const prompt=`LANGUAGE: ${l}
DIRECTION: ${txt(b.direction,100)}
CASE INDEX: ${txt(b.caseIndex,20)}
STUDENT ROLE: ${txt(b.role,100)}
STAGE: ${txt(b.stage,100)}
ACTION: ${a}

CASE TITLE:
${c.title}

CASE FACTS:
${c.facts}

EVIDENCE:
${c.evidence}

PEOPLE:
${people(c.people)}

MEMORY:
${mem(s)}

STUDENT:
${q}

Talabaning ayni so‘ziga dinamik reaksiya qil. Talabaning fikriga qo‘shilish uchun kazus faktlarini o‘zgartirma. FAQAT JSON qaytar.`;

 const r=await ai.interactions.create({
   model:GEMINI_MODEL,
   input:systemPrompt(l)+"\n\n"+prompt
 });
 const o=parseJSON(r.output_text);
 const result={
  kind:["QUESTION","END","OBJECTION","MOTION","STATEMENT"].includes(txt(o.kind,30).toUpperCase())?txt(o.kind,30).toUpperCase():a,
  target:o.target==null?null:txt(o.target,100),
  answer:txt(o.answer,6000),
  judgeReaction:txt(o.judgeReaction,6000),
  continueStage:typeof o.continueStage==="boolean"?o.continueStage:a!=="END"
 };
 if(!result.answer)Object.assign(result,fallback(l,a));
 remember(s,{at:new Date().toISOString(),student:q,answer:result.answer,judgeReaction:result.judgeReaction,kind:result.kind,stage:txt(b.stage,100)});
 return{...result,provider:"gemini",model:GEMINI_MODEL,language:l,memoryTurns:s.turns.length};
}

app.get("/api/health",(req,res)=>res.json({ok:true,service:"Huquqiy AI Court Engine",version:"V9",provider:"Google Gemini",model:GEMINI_MODEL,keyConfigured:Boolean(GEMINI_API_KEY),languages:["uz","ru","en"],sessions:sessions.size}));

app.post("/api/court-turn",async(req,res)=>{
 try{res.json({ok:true,...await courtTurn(req.body||{})})}
 catch(e){
  console.error("COURT_TURN_ERROR:",e?.message||e);
  const l=lang(req.body?.language),a=action(req.body?.question||req.body?.prompt);
  res.json({ok:true,...fallback(l,a),provider:"local-fallback",language:l,error:txt(e?.message||"Court engine error",500)});
 }
});

app.post("/api/session/reset",(req,res)=>{
 const id=txt(req.body?.sessionId,100); if(id)sessions.delete(id);
 res.json({ok:true,sessionId:id||null});
});

app.get("/api/session/:sessionId",(req,res)=>{
 const id=txt(req.params.sessionId,100),s=sessions.get(id);
 if(!s)return res.status(404).json({ok:false,error:"Session not found"});
 res.json({ok:true,sessionId:id,turns:s.turns});
});


app.post("/api/test-analysis", async (req,res)=>{
  try{
    const l=lang(req.body?.language);
    const code=txt(req.body?.code,30);
    const topic=txt(req.body?.topic,300);
    const score=Number(req.body?.score||0);
    const answers=Array.isArray(req.body?.answers)?req.body.answers.slice(0,20):[];

    console.log("TEST_ANALYSIS_REQUEST:", {code,topic,score,answers:answers.length,model:GEMINI_MODEL,ai:!!ai});

    if(!answers.length){
      return res.status(400).json({ok:false,error:"Frontend 20 ta javobni serverga yubormadi."});
    }
    if(!ai){
      return res.status(503).json({ok:false,error:"Gemini client ishga tushmagan. GEMINI_API_KEY ni tekshiring."});
    }

    const compact=answers.map((a,i)=>[
      `${i+1}. ${txt(a.question,500)}`,
      `Talaba: ${txt(a.student,250)}`,
      `To'g'ri: ${txt(a.correct,250)}`,
      `Holat: ${a.isCorrect===true?"TO'G'RI":"XATO"}`,
      `Izoh: ${txt(a.explanation,500)}`,
      `Asos: ${txt(a.legalBasis,250)}`
    ].join("\n")).join("\n\n");

    const languageName=l==="ru"?"RUS TILIDA":l==="en"?"INGLIZ TILIDA":"O'ZBEK TILIDA";
    const prompt=`${languageName} javob ber.
Sen huquq talabasining protsessual test natijasini tahlil qilasan.
Kodeks: ${code}
Mavzu: ${topic}
Natija: ${score}/20.

Quyidagi 20 javobning HAMMASINI tahlil qil.
To'g'ri javoblarni ham izohla.
Xato javoblarda xato sababini va to'g'ri javobni tushuntir.
Faqat berilgan "To'g'ri", "Izoh" va "Asos" ma'lumotlariga tayan.
Yangi modda raqami yoki norma o'ylab topma.
Oxirida: KUCHLI TOMONLAR, XATOLAR/ZAIF TOMONLAR, 3-5 TA TAVSIYA ber.

${compact}`;

    const response=await ai.interactions.create({
      model:GEMINI_MODEL,
      input:prompt
    });

    const analysis=String(response?.output_text||"").trim();
    console.log("TEST_ANALYSIS_SUCCESS:", {chars:analysis.length});
    if(!analysis){
      return res.status(502).json({ok:false,error:"Gemini javob berdi, lekin matn bo'sh qaytdi.",provider:"gemini"});
    }
    return res.json({ok:true,analysis,provider:"gemini",model:GEMINI_MODEL,score,total:answers.length});
  }catch(e){
    const msg=String(e?.message||e);
    console.error("TEST_ANALYSIS_ERROR:",msg);
    return res.status(500).json({
      ok:false,
      error:"Gemini test tahlili xatosi: "+msg.slice(0,700),
      model:GEMINI_MODEL
    });
  }
});

app.get("/api/test-analysis/health", async (req,res)=>{
  res.json({
    ok:true,
    route:"/api/test-analysis",
    geminiConfigured:!!process.env.GEMINI_API_KEY,
    clientReady:!!ai,
    model:GEMINI_MODEL
  });
});

/* EXPRESS 5 FIX: app.get("*") YO‘Q */
app.use((req,res,next)=>{
 if(req.path.startsWith("/api/"))return res.status(404).json({ok:false,error:"API route not found"});
 if(req.method!=="GET")return next();
 res.sendFile(path.join(__dirname,"public","index.html"));
});

app.use((err,req,res,next)=>{
 console.error("SERVER_ERROR:",err);
 if(res.headersSent)return next(err);
 res.status(500).json({ok:false,error:"Internal server error"});
});

console.log("TEST ANALYSIS ROUTE: /api/test-analysis READY");
console.log("GEMINI API MODE: INTERACTIONS");
app.listen(PORT,"0.0.0.0",()=>{
 console.log("HUQUQIY AI COURT ENGINE V17 GEMINI 3.8");
 console.log("PORT:",PORT);
 console.log("MODEL:",GEMINI_MODEL);
 console.log("GEMINI KEY:",GEMINI_API_KEY?"CONFIGURED":"NOT CONFIGURED");
 console.log("EXPRESS 5 WILDCARD FIX: OK");
});
