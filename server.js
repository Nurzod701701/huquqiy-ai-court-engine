import express from "express";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const app=express();
const port=Number(process.env.PORT || 10000);
const model=process.env.GEMINI_MODEL || "gemini-3.8-flash";

app.use(express.json({limit:"2mb"}));
app.use(express.static(path.join(__dirname,"public")));

const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});

function safeText(v,max=18000){
  return typeof v==="string" ? v.slice(0,max) : "";
}

function normalizeResult(obj){
  const allowed=new Set(["QUESTION","END","OBJECTION","MOTION","STATEMENT"]);
  return {
    kind:allowed.has(obj?.kind)?obj.kind:"STATEMENT",
    target:typeof obj?.target==="string"?obj.target:null,
    answer:typeof obj?.answer==="string"?obj.answer.slice(0,4000):"",
    judgeReaction:typeof obj?.judgeReaction==="string"?obj.judgeReaction.slice(0,2500):"",
    continueStage:obj?.continueStage!==false
  };
}

app.get("/api/health",(req,res)=>{
  res.json({
    ok:true,
    engine:"Huquqiy AI Gemini Court Engine V8",
    provider:"Google Gemini",
    model,
    keyConfigured:Boolean(process.env.GEMINI_API_KEY)
  });
});

app.post("/api/court-turn",async(req,res)=>{
  try{
    if(!process.env.GEMINI_API_KEY){
      return res.status(503).json({error:"GEMINI_API_KEY sozlanmagan"});
    }

    const body=req.body||{};
    const c=body.caseData||{};
    const people=c.people||{};
    const memory=Array.isArray(body.memory)?body.memory.slice(-12):[];

    const systemInstruction=`
Siz O'zbekiston sud jarayonini o'rgatuvchi HUQUQIY AI COURT ENGINE'siz.
Bu o'quv sud simulyatsiyasi. Talaba erkin savol, e'tiroz, iltimosnoma yoki bayonot yozadi.
TIL QOIDASI: request ichidagi language tanlangan interfeys tilidir. language=uz bo'lsa FAQAT o'zbekcha; language=ru bo'lsa FAQAT ruscha; language=en bo'lsa FAQAT inglizcha javob ber. Talaba boshqa tilda yozsa ham javob tanlangan interfeys tilida bo'lsin.

QAT'IY QOIDALAR:
1. Faqat berilgan KAZUS, DALILLAR, ISHTIROKCHILAR va SUHBAT XOTIRASI doirasida ishlang.
2. Yangi fakt, yangi dalil, yangi guvoh yoki yangi ekspertiza to'qimang.
3. Har bir shaxs o'z rolidan chiqmasin. Guvoh faqat bevosita bilganini, ekspert faqat ekspertiza doirasidagini aytsin.
4. Fakt yetarli bo'lmasa tabiiy ravishda bilmasligini aytsin.
5. Oldingi javoblarni eslang. Kazusda mavjud bo'lmasa tasodifiy ziddiyat yaratmang.
6. Talaba ziddiyatni ko'rsatsa aynan o'sha ziddiyatga javob bering.
7. "Boshqa savolim yo'q" mazmunida bo'lsa kind=END.
8. E'tiroz bo'lsa kind=OBJECTION; iltimosnoma bo'lsa kind=MOTION.
9. Savol bo'lsa kind=QUESTION va target kim javob berishini ko'rsating.
10. Oddiy protsessual bayonot bo'lsa kind=STATEMENT.
11. Yashirin huquqiy masalalarni sud davomida talabaga hint qilib oshkor qilmang.
12. Sud zalidagi tabiiy, professional va qisqa nutqdan foydalaning.
13. Faqat belgilangan JSON strukturada javob bering.`;

    const input=`
TANLANGAN TIL: ${safeText(body.language||"uz",10)}
YO'NALISH: ${safeText(body.direction,100)}
TALABA ROLI: ${safeText(body.role,100)}
JORIY BOSQICH: ${safeText(body.stage,300)}
SUD SAVOLI/PROMPT: ${safeText(body.prompt,1000)}

KAZUS NOMI:
${safeText(c.title,500)}

KAZUS FAKTLARI:
${safeText(c.facts)}

DALILLAR:
${safeText(c.evidenceDossier,12000)}

ISHTIROKCHILAR:
${JSON.stringify(people).slice(0,5000)}

OLDINGI SAVOL-JAVOBLAR:
${JSON.stringify(memory).slice(0,12000)}

TALABANING HOZIRGI GAPI:
${safeText(body.question,4000)}
`;

    const response=await ai.models.generateContent({
      model,
      contents:input,
      config:{
        systemInstruction,
        responseMimeType:"application/json",
        responseSchema:{
          type:"object",
          properties:{
            kind:{type:"string",enum:["QUESTION","END","OBJECTION","MOTION","STATEMENT"]},
            target:{type:["string","null"]},
            answer:{type:"string"},
            judgeReaction:{type:"string"},
            continueStage:{type:"boolean"}
          },
          required:["kind","answer","continueStage"]
        },
        temperature:0.35,
        maxOutputTokens:700
      }
    });

    const raw=(response.text||"").trim();
    let parsed;
    try{
      parsed=JSON.parse(raw);
    }catch{
      return res.status(502).json({error:"Gemini JSON formatida javob bermadi",raw:raw.slice(0,1000)});
    }
    res.json(normalizeResult(parsed));
  }catch(error){
    console.error(error);
    res.status(500).json({error:"Gemini Court Engine xatosi",detail:error?.message||String(error)});
  }
});

app.get("*",(req,res)=>{
  res.sendFile(path.join(__dirname,"public","index.html"));
});

app.listen(port,"0.0.0.0",()=>{
  console.log(`Huquqiy AI Gemini Court Engine V8 port ${port} da ishlamoqda`);
});
