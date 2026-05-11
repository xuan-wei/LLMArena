import type { SSOProviderImpl } from "../index";

const provider: SSOProviderImpl = {
  id: "jaccount",
  name: "上海交通大学 jAccount",
  shortName: "上海交通大学 jAccount",

  isEnabled() {
    return !!(process.env.JACCOUNT_CLIENT_ID && process.env.JACCOUNT_CLIENT_SECRET);
  },

  buildAuthorizeUrl(state: string, redirectUri: string): string {
    const url = new URL("https://jaccount.sjtu.edu.cn/oauth2/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", process.env.JACCOUNT_CLIENT_ID!);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "openid");
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<{ sub: string; name?: string; institutionId?: string; email?: string }> {
    const res = await fetch("https://jaccount.sjtu.edu.cn/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: process.env.JACCOUNT_CLIENT_ID!,
        client_secret: process.env.JACCOUNT_CLIENT_SECRET!,
      }).toString(),
    });

    const tokenData: { id_token?: string; error?: string } = await res.json();

    if (!tokenData.id_token) {
      throw new Error("未获取到用户身份信息");
    }

    // Decode ID token payload (trusted: came from HTTPS token endpoint with client secret auth)
    const b64 = tokenData.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload: { sub?: string; name?: string; code?: string; email?: string } = JSON.parse(
      Buffer.from(b64, "base64").toString("utf-8"),
    );

    if (!payload.sub) {
      throw new Error("无法获取 jAccount 账号");
    }

    return {
      sub: payload.sub,
      name: payload.name,
      // `code` is the student/staff ID (学号/工号) in JAccount tokens
      institutionId: payload.code,
      // JAccount may return email directly; fallback is handled by buildEmail
      email: payload.email,
    };
  },

  buildEmail(sub: string): string {
    return `${sub}@sjtu.edu.cn`;
  },
};

export default provider;
