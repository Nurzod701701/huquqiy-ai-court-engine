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


// ======================================================
// MIDDLEWARE
// ======================================================

app.use(
  express.json({
    limit: "2mb"
  })
);

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);


// ======================================================
// GEMINI
// ======================================================

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});


// ======================================================
// HELPERS
// ======================================================

function safeText(value, max = 18000) {

  if (typeof value !== "string") {
    return "";
  }

  return value.slice(0, max);
}


function normalizeResult(data) {

  const allowedKinds =
    new Set([
      "QUESTION",
      "END",
      "OBJECTION",
      "MOTION",
      "STATEMENT"
    ]);

  return {

    kind:
      allowedKinds.has(data?.kind)
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
      data?.continueStage !== false
  };
}


// ======================================================
// HEALTH CHECK
// ======================================================

app.get(
  "/api/health",
  (req, res) => {

    res.json({

      ok: true,

      engine:
        "Huquqiy AI Gemini Court Engine",

      version:
        "8.1",

      provider:
        "Google Gemini",

      model:
        MODEL,

      keyConfigured:
        Boolean(
          process.env.GEMINI_API_KEY
        )

    });

  }
);


// ======================================================
// COURT ENGINE
// ======================================================

app.post(
  "/api/court-turn",

  async (req, res) => {

    try {

      // ----------------------------------------------
      // API KEY CHECK
      // ----------------------------------------------

      if (!process.env.GEMINI_API_KEY) {

        return res
          .status(503)
          .json({

            error:
              "GEMINI_API_KEY Render Environment'da sozlanmagan"

          });

      }


      // ----------------------------------------------
      // REQUEST DATA
      // ----------------------------------------------

      const body =
        req.body || {};

      const caseData =
        body.caseData || {};

      const people =
        caseData.people || {};

      const memory =
        Array.isArray(body.memory)
          ? body.memory.slice(-12)
          : [];


      // ==================================================
      // SYSTEM INSTRUCTION
      // ==================================================

      const systemInstruction = `

Siz "HUQUQIY AI COURT ENGINE" tizimisiz.

Sizning vazifangiz O'zbekiston sud jarayonini
realistik va professional tarzda simulyatsiya qilish.

Bu O'QUV SUD SIMULYATSIYASI.

Talaba sud jarayonida quyidagi rollardan
birini bajarishi mumkin:

- Sudya
- Prokuror
- Himoyachi
- Sudlanuvchi
- Jabrlanuvchi
- Da'vogar
- Javobgar
- Fuqarolik ishida taraf
- Iqtisodiy ishda taraf
- Ma'muriy ishda taraf


Talaba erkin ravishda:

- savol berishi;
- qo'shimcha savol berishi;
- aniqlashtiruvchi savol berishi;
- e'tiroz bildirishi;
- iltimosnoma kiritishi;
- dalil haqida so'rashi;
- hujjat haqida so'rashi;
- ekspertga savol berishi;
- guvohga savol berishi;
- ziddiyatni ko'rsatishi;
- protsessual bayonot berishi mumkin.


==================================================
QAT'IY SUD QOIDALARI
==================================================


1.

Faqat tizimga berilgan:

KAZUS,
DALILLAR,
ISHTIROKCHILAR,
EKSPERTIZA,
HUJJATLAR,
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
- audio;
- telefon yozuvi;
- bank hujjati;
- voqea;
- shaxs;
- sana;
- vaqt

yaratmang.


4.

Har bir sud ishtirokchisi
faqat o'ziga ma'lum ma'lumotlar
doirasida javob beradi.


5.

Guvoh voqeani ko'rmagan yoki bilmagan bo'lsa:

"Men buni ko'rmaganman."

yoki:

"Bu menga ma'lum emas."

mazmunidagi javobni beradi.


6.

Ekspert faqat ekspertiza
xulosasi va o'z vakolati doirasida
javob beradi.


7.

Sudlanuvchi faqat kazusda
unga tegishli bo'lgan faktlar
doirasida javob beradi.


8.

Jabrlanuvchi faqat o'ziga ma'lum
holatlar doirasida javob beradi.


9.

Oldingi savol-javoblarni hisobga oling.

Bir ishtirokchi oldin bir faktni aytgan bo'lsa,
keyingi javobda sababsiz uni o'zgartirmang.


10.

Agar talaba oldingi javob bilan
hozirgi javob o'rtasidagi haqiqiy
ziddiyatni ko'rsatsa,
shu ziddiyatga bevosita javob bering.


11.

Kazusda mavjud bo'lmagan ziddiyatni
sun'iy ravishda yaratmang.


==================================================
SAVOLLAR
==================================================


12.

Talaba savol bersa:

kind = "QUESTION"

bo'lishi kerak.


13.

target maydonida
savolga kim javob berishini ko'rsating.

Masalan:

"Sudlanuvchi"

"Guvoh"

"Jabrlanuvchi"

"Ekspert"

"Sudya"


14.

Savolga avval bevosita javob bering.

Keyin zarur bo'lsa
qisqa tushuntirish bering.


15.

Talaba qo'shimcha savol bersa,
sud bosqichini avtomatik tugatmang.


16.

Talaba bir ishtirokchiga
ketma-ket bir nechta savol berishi mumkin.


==================================================
SAVOLLARNI YAKUNLASH
==================================================


17.

Talaba:

"Boshqa savolim yo'q"

"Savolim yo'q"

"Yetarli"

"Keyingi bosqich"

"Keyingi bosqichga o'tamiz"

mazmunidagi gapni aytsa:

kind = "END"

bo'lishi kerak.


==================================================
E'TIROZ
==================================================


18.

Talaba e'tiroz bildirsa:

kind = "OBJECTION"


19.

E'tiroz bo'yicha sudya
qisqa protsessual munosabat bildirishi mumkin.


==================================================
ILTIMOSNOMA
==================================================


20.

Talaba iltimosnoma kiritsa:

kind = "MOTION"


21.

Sudya iltimosnomani
qanoatlantirish yoki rad etishdan oldin
zarur bo'lsa boshqa tarafning fikrini
so'rashi mumkin.


==================================================
BAYONOT
==================================================


22.

Oddiy protsessual bayonot bo'lsa:

kind = "STATEMENT"


==================================================
YASHIRIN HUQUQIY MASALALAR
==================================================


23.

Sud jarayoni davomida
talabaga yashirin huquqiy masalalarni
oldindan aytib bermang.


24.

Masalan quyidagi masalalarni
talaba o'zi aniqlashi kerak:

- shaxsning yoshi;
- voqea sodir bo'lgan sanadagi yoshi;
- javobgarlik yoshi;
- muomala layoqati;
- qasd;
- ehtiyotsizlik;
- sababiy bog'lanish;
- zaruriy mudofaa;
- dalilning maqbulligi;
- dalilning ishonchliligi;
- dalilning kelib chiqishi;
- protsessual buzilish;
- guvoh ko'rsatmasidagi ziddiyat;
- ekspert xulosasining chegarasi;
- vakolat;
- muddat;
- huquqiy oqibat.


25.

Talabaga sud jarayoni davomida:

"Yoshga e'tibor bering."

"Bu yerda muhim huquqiy muammo bor."

"Mana shu moddaga qarang."

"Bu dalil maqbul emas."

"Bu faktni tekshiring."

kabi yashirin maslahat bermang.


26.

Talaba o'zi masalani ko'tarsa,
unga kazus doirasida tabiiy javob bering.


==================================================
REALISTIK SUD MUHITI
==================================================


27.

Javoblar sud zalidagi tabiiy,
professional nutqqa o'xshasin.


28.

Keraksiz uzun ma'ruza yozmang.


29.

Sud ishtirokchisi savolga
odam kabi tabiiy javob bersin.


30.

Har bir javobni qonun darsiga
aylantirib yubormang.


31.

Agar savolga javob berish uchun
kazusda fakt yetarli bo'lmasa:

"Bu holat kazus materiallarida ko'rsatilmagan."

yoki mazmunan shunga teng
javob bering.


==================================================
XOTIRA
==================================================


32.

OLDINGI SUD SAVOL-JAVOBLARI
bo'limidagi ma'lumotlardan foydalaning.


33.

Talaba oldin bir savol bergan bo'lsa,
keyingi savolni uning davomi sifatida
tushunishga harakat qiling.


34.

Ishtirokchining oldingi javobini
eslab qoling.


==================================================
JSON JAVOB
==================================================


35.

Faqat JSON formatida javob bering.


JSON struktura:

{
  "kind": "QUESTION",
  "target": "Guvoh",
  "answer": "Guvohning javobi",
  "judgeReaction": "",
  "continueStage": true
}


kind faqat quyidagilardan biri bo'lishi mumkin:

QUESTION
END
OBJECTION
MOTION
STATEMENT


36.

Markdown yozmang.

37.

JSON tashqarisida hech qanday
qo'shimcha matn yozmang.

`;


      // ==================================================
      // CASE CONTEXT
      // ==================================================

      const input = `

==================================================
SUD YO'NALISHI
==================================================

${safeText(body.direction, 100)}


==================================================
TALABANING ROLI
==================================================

${safeText(body.role, 100)}


==================================================
JORIY SUD BOSQICHI
==================================================

${safeText(body.stage, 300)}


==================================================
SUDNING JORIY SAVOLI / PROMPT
==================================================

${safeText(body.prompt, 1500)}


==================================================
KAZUS NOMI
==================================================

${safeText(caseData.title, 500)}


==================================================
KAZUS FAKTLARI
==================================================

${safeText(
  caseData.facts,
  18000
)}


==================================================
DALILLAR
==================================================

${safeText(
  caseData.evidenceDossier,
  12000
)}


==================================================
SUD ISHTIROKCHILARI
==================================================

${JSON.stringify(people).slice(
  0,
  5000
)}


==================================================
OLDINGI SUD SAVOL-JAVOBLARI
==================================================

${JSON.stringify(memory).slice(
  0,
  12000
)}


==================================================
TALABANING HOZIRGI GAPI
==================================================

${safeText(
  body.question,
  4000
)}


Talabaning aynan shu gapiga
sud jarayoni doirasida javob ber.

Kazusda mavjud bo'lmagan
faktni yaratma.

`;


      // ==================================================
      // GEMINI REQUEST
      // ==================================================

      const response =
        await ai.models.generateContent({

          model:
            MODEL,

          contents:
            input,

          config: {

            systemInstruction:
              systemInstruction,

            responseMimeType:
              "application/json",

            responseSchema: {

              type:
                "object",

              properties: {

                kind: {

                  type:
                    "string",

                  enum: [
                    "QUESTION",
                    "END",
                    "OBJECTION",
                    "MOTION",
                    "STATEMENT"
                  ]

                },


                target: {

                  type: [
                    "string",
                    "null"
                  ]

                },


                answer: {

                  type:
                    "string"

                },


                judgeReaction: {

                  type:
                    "string"

                },


                continueStage: {

                  type:
                    "boolean"

                }

              },


              required: [

                "kind",

                "answer",

                "continueStage"

              ]

            },


            temperature:
              0.35,


            maxOutputTokens:
              700

          }

        });


      // ==================================================
      // GEMINI RESPONSE
      // ==================================================

      const raw =
        (response.text || "")
          .trim();


      let parsed;


      try {

        parsed =
          JSON.parse(raw);

      }

      catch (parseError) {

        console.error(
          "Gemini JSON parse error:",
          raw
        );


        return res
          .status(502)
          .json({

            error:
              "Gemini JSON formatida javob bermadi",

            raw:
              raw.slice(0, 1000)

          });

      }


      // ==================================================
      // RESPONSE TO FRONTEND
      // ==================================================

      return res.json(
        normalizeResult(parsed)
      );

    }

    catch (error) {

      console.error(
        "Gemini Court Engine error:",
        error
      );


      return res
        .status(500)
        .json({

          error:
            "Gemini Court Engine xatosi",

          detail:
            error?.message ||
            String(error)

        });

    }

  }
);


// ======================================================
// FRONTEND FALLBACK
// Express 5 uchun app.get("*") ISHLATMAYMIZ.
// ======================================================

app.use(
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );

  }
);


// ======================================================
// START SERVER
// ======================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Huquqiy AI Gemini Court Engine ${PORT} portda ishlamoqda`
    );

  }
);
