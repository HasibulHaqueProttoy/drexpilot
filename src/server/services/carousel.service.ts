import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface CarouselSlide {
  slide_number?: number;
  headline: string;
  body?: string;
  bullet_points?: string[];
  highlight?: string;
}

export interface CarouselOptions {
  deck_title: string;
  theme?: "dark" | "blue" | "clean" | "emerald";
  author_name?: string;
  author_handle?: string;
  slides: CarouselSlide[];
}

const THEMES = {
  dark: {
    bg: "#0f172a",
    cardBg: "#1e293b",
    textPrimary: "#f8fafc",
    textSecondary: "#94a3b8",
    accent: "#38bdf8",
    accentSecondary: "#818cf8",
  },
  blue: {
    bg: "#0284c7",
    cardBg: "#0369a1",
    textPrimary: "#ffffff",
    textSecondary: "#e0f2fe",
    accent: "#facc15",
    accentSecondary: "#38bdf8",
  },
  clean: {
    bg: "#ffffff",
    cardBg: "#f8fafc",
    textPrimary: "#0f172a",
    textSecondary: "#475569",
    accent: "#2563eb",
    accentSecondary: "#6366f1",
  },
  emerald: {
    bg: "#064e3b",
    cardBg: "#065f46",
    textPrimary: "#ffffff",
    textSecondary: "#a7f3d0",
    accent: "#34d399",
    accentSecondary: "#6ee7b7",
  },
};

export async function generateCarouselPdf(options: CarouselOptions, uploadsDir: string): Promise<{ filename: string; filePath: string; slideCount: number }> {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const themeKey = options.theme && options.theme in THEMES ? options.theme : "dark";
  const theme = THEMES[themeKey as keyof typeof THEMES];
  const slides = options.slides && options.slides.length > 0 ? options.slides : [
    { headline: options.deck_title, body: "Created with SMMPilot AI" },
  ];

  const filename = `carousel_${Date.now()}_${crypto.randomBytes(6).toString("hex")}.pdf`;
  const filePath = path.join(uploadsDir, filename);

  // Standard LinkedIn Carousel Size: 1080 x 1080 points (Square) or 1080 x 1350 (Portrait 4:5)
  // PDF points are typically 72 per inch; using 720 x 720 pt for razor-sharp vector rendering
  const PAGE_WIDTH = 720;
  const PAGE_HEIGHT = 720;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PAGE_WIDTH, PAGE_HEIGHT],
      margin: 0,
      autoFirstPage: false,
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    slides.forEach((slide, idx) => {
      doc.addPage({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });

      // 1. Background fill
      doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(theme.bg);

      // 2. Decorative gradient header bar
      doc.rect(40, 36, PAGE_WIDTH - 80, 4).fill(theme.accent);

      // 3. Top Branding / Author row
      const authorText = options.author_name ? options.author_name : "SMMPilot";
      doc.fontSize(14).fillColor(theme.textSecondary).text(authorText, 40, 52, { width: 350 });

      // Slide counter (e.g. 1 / 5)
      const counterText = `${idx + 1} / ${slides.length}`;
      doc.fontSize(14).fillColor(theme.accent).text(counterText, PAGE_WIDTH - 120, 52, { width: 80, align: "right" });

      // 4. Center Content Card
      doc.roundedRect(40, 96, PAGE_WIDTH - 80, PAGE_HEIGHT - 176, 16).fill(theme.cardBg);

      // 5. Headline
      const isTitleSlide = idx === 0;
      const headlineFontSize = isTitleSlide ? 38 : 32;
      doc.fontSize(headlineFontSize)
        .font("Helvetica-Bold")
        .fillColor(theme.textPrimary)
        .text(slide.headline, 72, 140, {
          width: PAGE_WIDTH - 144,
          lineGap: 6,
        });

      let currentY = doc.y + 24;

      // 6. Body Paragraph
      if (slide.body) {
        doc.fontSize(20)
          .font("Helvetica")
          .fillColor(theme.textSecondary)
          .text(slide.body, 72, currentY, {
            width: PAGE_WIDTH - 144,
            lineGap: 8,
          });
        currentY = doc.y + 20;
      }

      // 7. Bullet Points
      if (slide.bullet_points && slide.bullet_points.length > 0) {
        doc.fontSize(18).font("Helvetica");
        slide.bullet_points.forEach((bullet) => {
          doc.fillColor(theme.accent).text("• ", 72, currentY, { continued: true });
          doc.fillColor(theme.textPrimary).text(bullet, { width: PAGE_WIDTH - 170, lineGap: 6 });
          currentY = doc.y + 12;
        });
      }

      // 8. Bottom Highlight / Call To Action on card
      const highlightText = slide.highlight || (isTitleSlide ? "Swipe to read →" : (idx === slides.length - 1 ? "Follow for more insights" : ""));
      if (highlightText) {
        doc.fontSize(16)
          .font("Helvetica-Bold")
          .fillColor(theme.accent)
          .text(highlightText, 72, PAGE_HEIGHT - 130, { width: PAGE_WIDTH - 144, align: "center" });
      }

      // 9. Footer attribution
      const footerHandle = options.author_handle ? `@${options.author_handle.replace(/^@/, "")}` : "smmpilot.drex.agency";
      doc.fontSize(12)
        .font("Helvetica")
        .fillColor(theme.textSecondary)
        .text(footerHandle, 40, PAGE_HEIGHT - 50, { width: PAGE_WIDTH - 80, align: "center" });
    });

    doc.end();

    stream.on("finish", () => {
      resolve({
        filename,
        filePath,
        slideCount: slides.length,
      });
    });

    stream.on("error", (err) => {
      reject(err);
    });
  });
}
