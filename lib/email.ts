import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { normalizeLanguage } from "@/lib/i18n";

function contactEmail() {
  return process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "admin";
}

function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: process.env.SMTP_SECURE !== "false",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendEmail(to: string, subject: string, html: string) {
  const transport = getTransport();
  if (!transport) return; // SMTP not configured — silent skip
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject,
    html,
  });
}

export async function sendWelcomeEmail(to: string, name: string, language: unknown = "en") {
  const cfg = await prisma.systemConfig.findUnique({ where: { key: "welcome_email_enabled" } });
  if (cfg?.value !== "true") return;
  const lang = normalizeLanguage(language);
  await sendEmail(
    to,
    lang === "zh" ? "欢迎加入 LLM Arena" : "Welcome to LLM Arena",
    lang === "zh"
      ? `<p>你好 ${name}，</p><p>欢迎加入 LLM Arena 大模型竞技场！登录后即可参与活动。</p><p>如有问题请联系 <a href="mailto:${contactEmail()}">${contactEmail()}</a></p>`
      : `<p>Hello ${name},</p><p>Welcome to LLM Arena. You can sign in and join activities now.</p><p>If you have questions, contact <a href="mailto:${contactEmail()}">${contactEmail()}</a>.</p>`,
  );
}

export async function sendPublisherGrantedEmail(to: string, name: string, language: unknown = "en") {
  const lang = normalizeLanguage(language);
  await sendEmail(
    to,
    lang === "zh" ? "【LLM Arena】发布权限已审批通过" : "[LLM Arena] Publisher access approved",
    lang === "zh"
      ? `<p>你好 ${name}，</p><p>您的发布权限申请已审批通过，现在可以在平台上创建和发布活动。</p><p>如有问题请联系 <a href="mailto:${contactEmail()}">${contactEmail()}</a></p>`
      : `<p>Hello ${name},</p><p>Your publisher access request has been approved. You can now create and publish activities.</p><p>If you have questions, contact <a href="mailto:${contactEmail()}">${contactEmail()}</a>.</p>`,
  );
}

export async function sendPublisherRejectedEmail(to: string, name: string, reason?: string | null, language: unknown = "en") {
  const lang = normalizeLanguage(language);
  await sendEmail(
    to,
    lang === "zh" ? "【LLM Arena】发布权限申请未通过" : "[LLM Arena] Publisher access request rejected",
    lang === "zh"
      ? `<p>你好 ${name}，</p><p>很遗憾，您的发布权限申请未通过审核。${reason ? `<br/>原因：${reason}` : ""}</p><p>如有疑问请联系 <a href="mailto:${contactEmail()}">${contactEmail()}</a></p>`
      : `<p>Hello ${name},</p><p>Unfortunately, your publisher access request was rejected.${reason ? `<br/>Reason: ${reason}` : ""}</p><p>If you have questions, contact <a href="mailto:${contactEmail()}">${contactEmail()}</a>.</p>`,
  );
}

export async function sendAdminNewApplicationEmail(adminEmails: string[], applicantName: string, language: unknown = "en") {
  if (adminEmails.length === 0) return;
  const lang = normalizeLanguage(language);
  await sendEmail(
    adminEmails.join(","),
    lang === "zh" ? "【LLM Arena】收到新的发布权限申请" : "[LLM Arena] New publisher access request",
    lang === "zh"
      ? `<p>用户 <strong>${applicantName}</strong> 提交了发布权限申请，请登录管理控制台审批。</p>`
      : `<p>User <strong>${applicantName}</strong> submitted a publisher access request. Please sign in to the admin console to review it.</p>`,
  );
}

export async function sendPasswordResetEmail(to: string, name: string, resetLink: string, language: unknown = "en") {
  const lang = normalizeLanguage(language);
  await sendEmail(
    to,
    lang === "zh" ? "【LLM Arena】重置密码" : "[LLM Arena] Reset your password",
    lang === "zh"
      ? `<p>你好 ${name}，</p><p>您请求了重置密码。点击以下链接在 1 小时内完成密码重置：</p><p><a href="${resetLink}">${resetLink}</a></p><p>如果您没有发起此请求，请忽略此邮件。</p>`
      : `<p>Hello ${name},</p><p>You requested a password reset. Click the link below within 1 hour to reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p><p>If you did not request this, please ignore this email.</p>`,
  );
}
