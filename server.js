import express from "express";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 10000);

const MODEL =
  process.env.GEMINI_MODEL || "gemini-3.8-flash";

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

function safeText(value, max = 18000) {
  if (typeof value !== "string") return "";
  return value.slice(0, max);
}

function normalizeResult(data) {
  const allowedKinds = new Set([
    "QUESTION",
    "END",
    "OBJECTION",
    "MOTION",
    "STATEMENT",
  ]);

  return {
    kind: allowedKinds.has(data?.kind)
      ? data.kind
      : "STATEMENT",

    target:
      typeof data?.target === "string"
        ? data.target
        : null,

    answer:
      typeof data?.answer === "string"
        ? data.answer.slice(0, 4000)
        : "",

    judgeReaction:
      typeof data?.judgeReaction === "string"
        ? data.judgeReaction.slice(0, 2500)
        : "",

    continueStage:
      data?.continueStage !== false,
  };
}


// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    engine: "Huquqiy AI Gemini Court Engine",
    version: "8.0",
    provider: "Google Gemini",
    model: MODEL,
    keyConfigured: Boolean(
      process.env.GEMINI_API_KEY
    ),
  });
});


// ==========================================
// COURT ENGINE
// ==========================================

app.post("/api/court-turn", async (req, res) => {
  try {

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: "GEMINI_API_KEY Render'da sozlanmagan",
      });
    }

    const body = req.body || {};
    const caseData = body.caseData || {};
    const people = caseData.people || {};

    const memory = Array.isArray(body.memory)
      ? body.memory.slice(-12)
      : [];


    // ======================================
    // SYSTEM INSTRUCTION
    // ======================================

    const systemInstruction = `
Siz "HUQUQIY AI COURT ENGINE" tizimisiz.

Sizning vazifangiz O'zbekiston sud jarayonini
realistik tarzda simulyatsiya qilish.

Talaba sud jarayonida quyidagi rollardan
birini bajarishi mumkin:

- Sudya
- Prokuror
- Himoyachi
- Sudlanuvchi
- Jabrlanuvchi
- Fuqarolik ishida taraf
- Iqtisodiy ishda taraf
- Ma'muriy ishda taraf

Talaba erkin ravishda:

- savol berishi;
- qo'shimcha savol berishi;
- e'tiroz bildirishi;
- iltimosnoma kiritishi;
- dalil haqida so'rashi;
- ziddiyatni ko'rsatishi;
- protsessual bayonot berishi mumkin.


QAT'IY QOIDALAR:

1.
Faqat tizimga berilgan:

KAZUS,
DALILLAR,
ISHTIROKCHILAR,
EKSPERTIZA,
va OLDINGI SUD SUHBATLARI

doirasida javob bering.

2.
Hech qachon yangi fakt to'qimang.

3.
Hech qachon mavjud bo'lmagan:

- guvoh;
- dalil;
- hujjat;
- ekspertiza;
- video;
- telefon yozuvi;
- voqea

yaratmang.

4.
Har bir sud ishtirokchisi
faqat o'ziga ma'lum ma'lumotlar
doirasida javob beradi.

5.
Guvoh voqeani ko'rmagan bo'lsa:

"Men buni ko'rmaganman"

yoki mazmunan shunga teng
javob berishi kerak.

6.
Ekspert faqat ekspertiza
xulosasi doirasida javob beradi.

7.
Oldingi savol-javoblarni eslab qoling.

Bir ishtirokchi oldin bir faktni aytgan bo'lsa,
keyingi javoblarda sababsiz uni o'zgartirmang.

8.
Agar talaba oldingi javob bilan
hozirgi javob o'rtasidagi ziddiyatni ko'rsatsa,
shu ziddiyatga bevosita javob bering.

9.
Talaba:

"Boshqa savolim yo'q",
"Savolim yo'q",
"Yetarli",
"Keyingi bosqich"

mazmunidagi gapni aytsa:

kind = "END"

bo'lishi kerak.

10.
Talaba e'tiroz bildirsa:

kind = "OBJECTION"

11.
Talaba iltimosnoma kiritsa:

kind = "MOTION"

12.
Talaba savol bersa:

kind = "QUESTION"

va target maydonida
kim javob berishi kerakligini ko'rsating.

Masalan:

Sudlanuvchi
Guvoh
Jabrlanuvchi
Ekspert
Sudya

13.
Oddiy protsessual bayonot bo'lsa:

kind = "STATEMENT"

14.
Sud jarayoni davomida
talabaga yashirin huquqiy masalalarni
oldindan aytib bermang.

Masalan:

yosh,
javobgarlik yoshi,
dalil maqbulligi,
qasd,
sababiy bog'lanish,
protsessual buzilish

kabi masalalarni talaba o'zi aniqlashi kerak.

15.
Talabaga:

"mana shu moddaga qarang",
"yoshga e'tibor bering",
"bu dalil maqbul emas"

kabi yashirin maslahatlar bermang.

16.
Javoblar sud zalidagi
tabiiy professional nutqqa o'xshasin.

17.
Keraksiz uzun ma'ruza yozmang.

18.
Talabaning savoliga avval
bevosita javob bering.

19.
Agar fakt kazusda mavjud bo'lmasa,
buni ochiq ayting.

20.
Faqat JSON formatida javob bering.
`;


    // ======================================
    // CURRENT CASE CONTEXT
    // ======================================

    const input = `

SUD YO'NALISHI:
${safeText(body.direction, 100)}

TALABANING ROLI:
${safeText(body.role, 100)}

JORIY SUD BOSQICHI:
${safeText(body.stage, 300)}

SUDNING JORIY SAVOLI:
${safeText(body.prompt, 1500)}


=============================
KAZUS NOMI
=============================

${safeText(caseData.title, 500)}


=============================
KAZUS FAKTLARI
=============================

${safeText(caseData.facts, 18000)}


=============================
DALILLAR
=============================

${safeText(
  caseData.evidenceDossier,
  12000
)}


=============================
SUD ISHTIROKCHILARI
=============================

${JSON.stringify(people).slice(0, 5000)}


=============================
OLDINGI SUD SAVOL-JAVOBLARI
=============================

${JSON.stringify(memory).slice(0, 12000)}


=============================
TALABANING HOZIRGI GAPI
=============================

${safeText(body.question, 4000)}

Talabaning aynan shu gapiga
sud jarayoni doirasida javob ber.
`;


    // ======================================
    // GEMINI
    // ======================================

    const response =
      await ai.models.generateContent({

        model: MODEL,

        contents: input,

        config: {

          systemInstruction,

          responseMimeType:
            "application/json",

          responseSchema: {

            type: "object",

            properties: {

              kind: {
                type: "string",
                enum: [
                  "QUESTION",
                  "END",
                  "OBJECTION",
                  "MOTION",
                  "STATEMENT",
                ],
              },

              target: {
                type: [
                  "string",
                  "null",
                ],
              },

              answer: {
                type: "string",
              },

              judgeReaction: {
                type: "string",
              },

              continueStage: {
                type: "boolean",
              },
            },

            required: [
              "kind",
              "answer",
              "continueStage",
            ],
          },

          temperature: 0.35,

          maxOutputTokens: 700,
        },
      });


    // ======================================
    // PARSE RESPONSE
    // ======================================

    const raw =
      (response.text || "").trim();

    let parsed;

    try {

      parsed = JSON.parse(raw);

    } catch (error) {

      console.error(
        "Gemini JSON parse error:",
        raw
      );

      return res.status(502).json({
        error:
          "Gemini JSON formatida javob bermadi",
      });
    }


    // ======================================
    // SEND RESULT
    // ======================================

    res.json(
      normalizeResult(parsed)
    );


  } catch (error) {

    console.error(
      "Gemini Court Engine:",
      error
    );

    res.status(500).json({

      error:
        "Gemini Court Engine xatosi",

      detail:
        error?.message ||
        String(error),

    });
  }
});


// ==========================================
// FRONTEND
// ==========================================

app.get("*", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );

});


// ==========================================
// START SERVER
// ==========================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Huquqiy AI Gemini Court Engine ${PORT} portda ishlamoqda`
    );

  }
);
