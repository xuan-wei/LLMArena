import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <p className="text-6xl font-bold text-muted-foreground/30">404</p>
        <h1 className="text-xl font-semibold">页面不存在</h1>
        <p className="text-sm text-muted-foreground">你访问的页面不存在或没有访问权限。</p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 mt-2 text-sm text-primary hover:underline"
        >
          ← 返回主页
        </Link>
      </div>
    </div>
  );
}
