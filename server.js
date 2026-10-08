import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = Number(process.env.PORT || 10000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_BACKUP_MODEL =
  process.env.GEMINI_BACKUP_MODEL || "";

const GEMINI_MAX_RETRIES = 2;

function geminiTemporaryError(error) {
  const message = String(error?.message || error || "");

  return (
    /503|UNAVAILABLE|high demand|overload|temporar/i.test(message) ||
    /429|RESOURCE_EXHAUSTED|rate limit/i.test(message)
  );
}

function geminiModelUnavailable(error) {
  const message = String(error?.message || error || "");

  return /404|NOT_FOUND|model.*not.*found|model.*no longer available/i.test(message);
}

function geminiWait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fastGeminiRequest(prompt, language) {
  if (!ai) {
    throw new Error("GEMINI_API_KEY sozlanmagan");
  }

  const models = [
    GEMINI_MODEL,
    GEMINI_BACKUP_MODEL
  ].filter((model, index, arr) =>
    model && arr.indexOf(model) === index
  );

  let lastError;

  for (const model of models) {
    for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction: systemPrompt(language),
            responseMimeType: "application/json",
            temperature: 0.4
          }
        });

        if (!response?.text?.trim()) {
          throw new Error("Gemini bo'sh javob qaytardi");
        }

        return {
          text: response.text,
          model
        };

      } catch (error) {
        lastError = error;

        console.error("GEMINI_ATTEMPT_ERROR", {
          model,
          attempt: attempt + 1,
          message: String(error?.message || error).slice(0, 500)
        });

        if (geminiModelUnavailable(error)) {
          break;
        }

        if (!geminiTemporaryError(error)) {
          throw error;
        }

        if (attempt < GEMINI_MAX_RETRIES) {
          await geminiWait(1200 * (attempt + 1));
        }
      }
    }
  }

  throw lastError || new Error("Gemini javob bermadi");
}

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
 if(!ai) throw new Error("GEMINI_API_KEY sozlanmagan");

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

 const geminiResponse=await fastGeminiRequest(prompt,l);
 const o=parseJSON(geminiResponse.text);
 const result={
  kind:["QUESTION","END","OBJECTION","MOTION","STATEMENT"].includes(txt(o.kind,30).toUpperCase())?txt(o.kind,30).toUpperCase():a,
  target:o.target==null?null:txt(o.target,100),
  answer:txt(o.answer,6000),
  judgeReaction:txt(o.judgeReaction,6000),
  continueStage:typeof o.continueStage==="boolean"?o.continueStage:a!=="END"
 };
 if(!result.answer)Object.assign(result,fallback(l,a));
 remember(s,{at:new Date().toISOString(),student:q,answer:result.answer,judgeReaction:result.judgeReaction,kind:result.kind,stage:txt(b.stage,100)});
 return{...result,provider:"gemini",model:geminiResponse.model,language:l,memoryTurns:s.turns.length};
}

app.get("/api/health",(req,res)=>res.json({ok:true,service:"Huquqiy AI Court Engine",version:"V22",provider:"Google Gemini",model:GEMINI_MODEL,keyConfigured:Boolean(GEMINI_API_KEY),languages:["uz","ru","en"],sessions:sessions.size}));

app.post("/api/court-turn",async(req,res)=>{
 try{res.json({ok:true,...await courtTurn(req.body||{})})}
 catch(e){
  console.error("COURT_TURN_ERROR:",e?.message||e);
  const l=lang(req.body?.language),a=action(req.body?.question||req.body?.prompt);
  const message=txt(e?.message||"Court engine error",500);
  const status=!ai?503:/429|RESOURCE_EXHAUSTED/i.test(message)?429:/401|403|API_KEY_INVALID|PERMISSION_DENIED/i.test(message)?502:/404|NOT_FOUND/i.test(message)?502:503;
  res.status(status).json({ok:false,provider:"gemini-error",language:l,error:message});
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


function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

function localTestAnalysis({language,code,topic,score,answers}){
 const l=lang(language);
 const wrong=answers.filter(a=>a.isCorrect!==true);
 const correct=answers.filter(a=>a.isCorrect===true);
 const pct=Math.round((score/Math.max(answers.length,1))*100);
 const rows=answers.map((a,i)=>{
   const status=a.isCorrect===true?(l==="ru"?"ВЕРНО":l==="en"?"CORRECT":"TO‘G‘RI"):(l==="ru"?"ОШИБКА":l==="en"?"WRONG":"XATO");
   const base=`${i+1}. ${status}\n${txt(a.question,450)}\n`;
   if(a.isCorrect===true){
     return base+(l==="ru"?`Ваш ответ: ${txt(a.student,220)}\nПояснение: ${txt(a.explanation,450)}\nОснование: ${txt(a.legalBasis,220)}`:
       l==="en"?`Your answer: ${txt(a.student,220)}\nExplanation: ${txt(a.explanation,450)}\nLegal basis: ${txt(a.legalBasis,220)}`:
       `Sizning javobingiz: ${txt(a.student,220)}\nIzoh: ${txt(a.explanation,450)}\nHuquqiy asos: ${txt(a.legalBasis,220)}`);
   }
   return base+(l==="ru"?`Ваш ответ: ${txt(a.student,220)}\nПравильный ответ: ${txt(a.correct,220)}\nПояснение: ${txt(a.explanation,450)}\nОснование: ${txt(a.legalBasis,220)}`:
     l==="en"?`Your answer: ${txt(a.student,220)}\nCorrect answer: ${txt(a.correct,220)}\nExplanation: ${txt(a.explanation,450)}\nLegal basis: ${txt(a.legalBasis,220)}`:
     `Sizning javobingiz: ${txt(a.student,220)}\nTo‘g‘ri javob: ${txt(a.correct,220)}\nIzoh: ${txt(a.explanation,450)}\nHuquqiy asos: ${txt(a.legalBasis,220)}`);
 }).join("\n\n");

 if(l==="ru") return `РЕЗУЛЬТАТ: ${score}/${answers.length} (${pct}%)\nВерных ответов: ${correct.length}. Ошибок: ${wrong.length}.\n\nАНАЛИЗ ВСЕХ ОТВЕТОВ\n${rows}\n\nСИЛЬНЫЕ СТОРОНЫ\nВы правильно ответили на ${correct.length} из ${answers.length} вопросов по теме «${topic}».\n\nСЛАБЫЕ СТОРОНЫ\n${wrong.length?`Повторите нормы и логику по ${wrong.length} ошибочным вопросам выше.`:"Существенных ошибок не выявлено; углубите понимание процессуальной логики и применения норм."}\n\nРЕКОМЕНДАЦИИ\n1. Повторите правовые основания каждого ошибочного ответа.\n2. Сопоставляйте вопрос с процессуальной стадией и полномочиями участников.\n3. Объясняйте, почему выбранный вариант верен, а остальные неверны.\n4. Повторно пройдите тему после изучения ошибок.\n\nПримечание: Gemini временно недоступен, поэтому показан резервный анализ на основе сохранённых ответов теста.`;

 if(l==="en") return `RESULT: ${score}/${answers.length} (${pct}%)\nCorrect: ${correct.length}. Wrong: ${wrong.length}.\n\nALL ANSWERS ANALYSIS\n${rows}\n\nSTRENGTHS\nYou answered ${correct.length} of ${answers.length} questions correctly in “${topic}”.\n\nWEAKNESSES\n${wrong.length?`Review the rules and reasoning behind the ${wrong.length} incorrect answers above.`:"No material errors were found; deepen your understanding of procedural reasoning and application."}\n\nRECOMMENDATIONS\n1. Review the legal basis for every incorrect answer.\n2. Connect each question to the procedural stage and participant powers.\n3. Explain why the selected option is correct and why alternatives are not.\n4. Retake the topic after reviewing mistakes.\n\nNote: Gemini is temporarily unavailable, so this is a fallback analysis based on the stored test answers.`;

 return `NATIJA: ${score}/${answers.length} (${pct}%)\nTo‘g‘ri javoblar: ${correct.length} ta. Xatolar: ${wrong.length} ta.\n\nBARCHA JAVOBLAR TAHLILI\n${rows}\n\nKUCHLI TOMONLAR\n“${topic}” mavzusida ${answers.length} savoldan ${correct.length} tasiga to‘g‘ri javob berdingiz.\n\nZAIF TOMONLAR\n${wrong.length?`Yuqoridagi ${wrong.length} ta xato savol bo‘yicha norma, protsessual bosqich va javob mantig‘ini qayta ko‘rib chiqing.`:"Jiddiy xato aniqlanmadi. Endi protsessual normalarni amaliy vaziyatga qo‘llashni chuqurlashtiring."}\n\nTAVSIYALAR\n1. Har bir xato javobning huquqiy asosini qayta o‘qing.\n2. Savolni protsessual bosqich va ishtirokchi vakolati bilan bog‘lang.\n3. Nega aynan shu variant to‘g‘ri, qolganlari noto‘g‘riligini izohlashga odatlaning.\n4. Xatolarni o‘rgangach mavzuni qayta ishlang.\n\nEslatma: Gemini vaqtincha band bo‘lgani uchun saqlangan test javoblari asosida zaxira tahlil ko‘rsatildi.`;
}

app.post("/api/test-analysis", async (req,res)=>{
  const l=lang(req.body?.language);
  const code=txt(req.body?.code,30);
  const topic=txt(req.body?.topic,300);
  const score=Number(req.body?.score||0);
  const answers=Array.isArray(req.body?.answers)?req.body.answers.slice(0,20):[];

  if(!answers.length){
    return res.status(400).json({ok:false,error:"Frontend test javoblarini serverga yubormadi."});
  }

  const fallback=()=>localTestAnalysis({language:l,code,topic,score,answers});

  if(!ai){
    return res.status(503).json({ok:false,provider:"gemini-error",error:"GEMINI_API_KEY sozlanmagan",score,total:answers.length});
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
Huquq talabasining ${code} bo'yicha "${topic}" mavzusidagi testini tahlil qil.
Natija: ${score}/${answers.length}.
Barcha ${answers.length} javobni tahlil qil: TO'G'RI javoblarni ham, XATO javoblarni ham.
Faqat quyida berilgan to'g'ri javob, izoh va huquqiy asosga tayan.
Yangi modda raqami yoki norma o'ylab topma.
Oxirida KUCHLI TOMONLAR, ZAIF TOMONLAR va 3-5 TA AMALIY TAVSIYA ber.

${compact}`;

  let lastError="";
  for(let attempt=1;attempt<=3;attempt++){
    try{
      console.log(`TEST_ANALYSIS_GEMINI_ATTEMPT_${attempt}`,{model:GEMINI_MODEL,answers:answers.length});
      const response=await ai.models.generateContent({model:GEMINI_MODEL,contents:prompt});
      const analysis=String(response?.text||"").trim();
      if(analysis){
        return res.json({ok:true,analysis,provider:"gemini",model:GEMINI_MODEL,attempt,score,total:answers.length});
      }
      lastError="Gemini bo'sh javob qaytardi.";
    }catch(e){
      lastError=String(e?.message||e);
      console.error(`TEST_ANALYSIS_ATTEMPT_${attempt}_ERROR`,lastError);
      const temporary=/503|high demand|overload|temporar|unavailable|429|resource.exhausted/i.test(lastError);
      if(!temporary) break;
      if(attempt<3) await sleep(attempt*900);
    }
  }

  console.warn("TEST_ANALYSIS_FALLBACK_USED",lastError.slice(0,300));
  return res.json({
    ok:true,
    analysis:fallback(),
    provider:"local-fallback",
    geminiError:lastError.slice(0,500),
    model:GEMINI_MODEL,
    score,total:answers.length
  });
});
app.post("/api/test-translate", async (req,res)=>{
  try{
    const target=lang(req.body?.language);
    const code=txt(req.body?.code,30);
    const topic=txt(req.body?.topic,300);
    const questions=Array.isArray(req.body?.questions)?req.body.questions.slice(0,20):[];
    if(target==="uz") return res.json({ok:true,questions,provider:"original"});
    if(!questions.length) return res.status(400).json({ok:false,error:"Tarjima uchun testlar kelmadi."});
    if(!ai) return res.status(503).json({ok:false,error:"Gemini translator tayyor emas."});

    const targetName=target==="ru"?"Russian":"English";
    const source=questions.map((q,i)=>({
      n:i+1,id:q.id,q:q.q,options:q.options,explanation:q.explanation,legalBasis:q.legalBasis
    }));
    const prompt=`Translate this Uzbek procedural-law test material into ${targetName}.
STRICT RULES:
- Return ONLY valid JSON object: {"questions":[...]}.
- Preserve n and id exactly.
- Preserve array order and all four option positions exactly; NEVER move options.
- Translate q, every options item, explanation, legalBasis.
- Do not answer the questions and do not change legal meaning.
- Keep abbreviations JPK, FPK, IPK, MSIYtK unchanged.
- Do not invent article numbers or legal rules.
- Output exactly ${questions.length} questions.

INPUT:
${JSON.stringify(source)}`;

    let last="";
    for(let attempt=1;attempt<=3;attempt++){
      try{
        const r=await ai.models.generateContent({model:GEMINI_MODEL,contents:prompt});
        const raw=String(r?.text||"").trim();
        const parsed=parseJSON(raw);
        const out=Array.isArray(parsed?.questions)?parsed.questions:[];
        if(out.length===questions.length){
          const safe=out.map((x,i)=>({
            id:questions[i].id,
            q:txt(x.q,1200)||questions[i].q,
            options:Array.isArray(x.options)&&x.options.length===4?x.options.map(v=>txt(v,700)):questions[i].options,
            correct:questions[i].correct,
            explanation:txt(x.explanation,1200)||questions[i].explanation,
            legalBasis:txt(x.legalBasis,600)||questions[i].legalBasis
          }));
          return res.json({ok:true,questions:safe,provider:"gemini",language:target});
        }
        last="Gemini tarjimada savollar sonini o'zgartirdi.";
      }catch(e){
        last=String(e?.message||e);
        if(attempt<3) await sleep(attempt*900);
      }
    }
    return res.status(503).json({ok:false,error:"Tarjima xizmati vaqtincha band: "+last.slice(0,300)});
  }catch(e){
    return res.status(500).json({ok:false,error:"Test tarjima xatosi: "+String(e?.message||e).slice(0,500)});
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
console.log("GEMINI API MODE: GENERATE_CONTENT");
app.listen(PORT,"0.0.0.0",()=>{
 console.log("HUQUQIY AI COURT ENGINE V21 MULTILINGUAL TESTS");
 console.log("PORT:",PORT);
 console.log("MODEL:",GEMINI_MODEL);
 console.log("GEMINI KEY:",GEMINI_API_KEY?"CONFIGURED":"NOT CONFIGURED");
 console.log("EXPRESS 5 WILDCARD FIX: OK");
});
