"use client";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { translateSystemText } from "@/lib/i18n";

interface Bank {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  _count: { items: number };
}

interface BankItem {
  id: string;
  content: string;
  answer: string | null;
  orderIndex: number;
}

interface BankDetail extends Omit<Bank, "_count"> {
  items: BankItem[];
}

const PAGE_SIZE = 10;

export default function AdminQuestionBanksPage() {
  const { user, loading, authFetch, locale } = useAuth();
  const router = useRouter();
  const tr = (text: string) => translateSystemText(locale === "zh-CN" ? "zh" : "en", text);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [page, setPage] = useState(1);

  // Create/edit bank dialog
  const [bankOpen, setBankOpen] = useState(false);
  const [editBankId, setEditBankId] = useState<string | null>(null);
  const [bankForm, setBankForm] = useState({ name: "", description: "" });
  const [savingBank, setSavingBank] = useState(false);

  // Detail dialog
  const [detail, setDetail] = useState<BankDetail | null>(null);
  const [detailPage, setDetailPage] = useState(1);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [newItem, setNewItem] = useState({ content: "", answer: "" });
  const [savingItem, setSavingItem] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importCSV, setImportCSV] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadBankTemplate = () => {
    const csv = "﻿" + [
      "question,answer",
      '"请描述大语言模型的主要特点","基于Transformer架构、通过大规模语料预训练的语言模型"',
      '"什么是 RAG？","检索增强生成，将外部检索与语言模型生成结合的技术"',
      '"写一个关于AI的故事（100字）",""',
    ].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "question_bank_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportBankCSV = (bank: BankDetail) => {
    function csvEscape(s: string) {
      if (s.includes(",") || s.includes('"') || s.includes("\n")) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }
    const rows = [
      "question,answer",
      ...bank.items.map((item) => [csvEscape(item.content), csvEscape(item.answer ?? "")].join(",")),
    ];
    const csv = "﻿" + rows.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${bank.name}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (user.role !== "ADMIN") router.replace("/not-found");
    }
  }, [user, loading, router]);

  const load = () =>
    authFetch("/api/admin/question-banks")
      .then((r) => r.json())
      .then((d) => setBanks(d.banks || []));

  useEffect(() => { if (user) load(); }, [user]); // eslint-disable-line

  const loadDetail = (id: string) =>
    authFetch(`/api/admin/question-banks/${id}`)
      .then((r) => r.json())
      .then((d) => { setDetail(d.bank); setDetailPage(1); });

  const totalPages = Math.ceil(banks.length / PAGE_SIZE);
  const pagedBanks = banks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openNew = () => {
    setEditBankId(null);
    setBankForm({ name: "", description: "" });
    setBankOpen(true);
  };

  const openEdit = (b: Bank) => {
    setEditBankId(b.id);
    setBankForm({ name: b.name, description: b.description });
    setBankOpen(true);
  };

  const saveBank = async () => {
    if (!bankForm.name.trim()) return toast.error(tr("名称不能为空"));
    setSavingBank(true);
    try {
      const url = editBankId ? `/api/admin/question-banks/${editBankId}` : "/api/admin/question-banks";
      const res = await authFetch(url, {
        method: editBankId ? "PUT" : "POST",
        body: JSON.stringify(bankForm),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setBankOpen(false);
      load();
      toast.success(tr(editBankId ? "已更新" : "已创建"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("失败"));
    } finally {
      setSavingBank(false);
    }
  };

  const deleteBank = async (id: string) => {
    if (!confirm(tr("确定删除该题库？题库内所有题目将一并删除。"))) return;
    await authFetch(`/api/admin/question-banks/${id}`, { method: "DELETE" });
    load();
    toast.success(tr("已删除"));
  };

  const addItem = async () => {
    if (!detail) return;
    if (!newItem.content.trim()) return toast.error(tr("题目内容不能为空"));
    setSavingItem(true);
    try {
      const res = await authFetch(`/api/admin/question-banks/${detail.id}/items`, {
        method: "POST",
        body: JSON.stringify({ content: newItem.content, answer: newItem.answer }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setAddItemOpen(false);
      setNewItem({ content: "", answer: "" });
      await loadDetail(detail.id);
      load();
      toast.success(tr("已添加"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("失败"));
    } finally {
      setSavingItem(false);
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!detail) return;
    await authFetch(`/api/admin/question-banks/${detail.id}/items/${itemId}`, { method: "DELETE" });
    await loadDetail(detail.id);
    load();
    toast.success(tr("已删除"));
  };

  const importBulk = async (csv: string) => {
    if (!detail) return;
    setImporting(true);
    try {
      const res = await authFetch(`/api/admin/question-banks/${detail.id}/items`, {
        method: "POST",
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setImportOpen(false);
      setImportCSV("");
      await loadDetail(detail.id);
      load();
      toast.success(tr(`已导入 ${data.count} 道题目`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("失败"));
    } finally {
      setImporting(false);
    }
  };

  const handleCSVFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const csv = ev.target?.result as string;
      importBulk(csv);
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  };

  const detailTotalPages = detail ? Math.ceil(detail.items.length / PAGE_SIZE) : 1;
  const detailPagedItems = detail ? detail.items.slice((detailPage - 1) * PAGE_SIZE, detailPage * PAGE_SIZE) : [];

  if (loading) return <div><Navbar /></div>;

  return (
    <div>
      <Navbar breadcrumbs={[{ label: tr("样例题库管理") }]} />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{tr("样例题库管理")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{tr("创建公共题库，供所有发布者导入使用。")}</p>
          </div>
          <Button size="sm" onClick={openNew}>{tr("+ 创建题库")}</Button>
        </div>

        {banks.length === 0 ? (
          <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
            <p className="mb-3">{tr("还没有样例题库")}</p>
            <Button variant="outline" size="sm" onClick={openNew}>{tr("创建第一个")}</Button>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-border/60 overflow-hidden bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-medium">{tr("题库名称")}</TableHead>
                    <TableHead className="font-medium">{tr("描述")}</TableHead>
                    <TableHead className="w-20 text-center font-medium">{tr("题目数")}</TableHead>
                    <TableHead className="w-36" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedBanks.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[240px] truncate">
                        {b.description || <span className="text-muted-foreground/40">{tr("无描述")}</span>}
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">{b._count.items}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                            onClick={() => { loadDetail(b.id); }}>{tr("查看")}</Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                            onClick={() => openEdit(b)}>{tr("编辑")}</Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive"
                            onClick={() => deleteBank(b.id)}>{tr("删除")}</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-4">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>{tr("上一页")}</Button>
                <span className="text-sm text-muted-foreground">{tr(`第 ${page} / ${totalPages} 页`)}</span>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>{tr("下一页")}</Button>
              </div>
            )}
          </>
        )}

        {/* Create/edit bank dialog */}
        <Dialog open={bankOpen} onOpenChange={setBankOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{tr(editBankId ? "编辑题库" : "创建样例题库")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label>{tr("题库名称 *")}</Label>
                <Input value={bankForm.name} onChange={(e) => setBankForm({ ...bankForm, name: e.target.value })}
                  placeholder={tr("例：写作能力测试题库")} />
              </div>
              <div className="space-y-1.5">
                <Label>{tr("描述（可选）")}</Label>
                <Input value={bankForm.description} onChange={(e) => setBankForm({ ...bankForm, description: e.target.value })}
                  placeholder={tr("简要说明题库内容")} />
              </div>
              <Button className="w-full" onClick={saveBank} disabled={savingBank}>
                {savingBank ? tr("保存中...") : tr("保存")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Detail dialog */}
        <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{detail?.name}</DialogTitle>
            </DialogHeader>
            {detail && (
              <div className="space-y-4 pt-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{tr(`${detail.items.length} 道题目`)}</p>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={downloadBankTemplate}>
                      {tr("CSV 模板")}
                    </Button>
                    {detail.items.length > 0 && (
                      <Button size="sm" variant="outline" onClick={() => exportBankCSV(detail)}>
                        {tr("导出 CSV")}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                      {tr("CSV 导入")}
                    </Button>
                    <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVFile} />
                    <Button size="sm" onClick={() => { setNewItem({ content: "", answer: "" }); setAddItemOpen(true); }}>
                      {tr("+ 添加题目")}
                    </Button>
                  </div>
                </div>

                {detail.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">{tr("题库为空，请添加题目。")}</p>
                ) : (
                  <>
                    <div className="rounded-lg border overflow-hidden">
                      <Table className="table-fixed">
                        <TableHeader>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead className="w-10">#</TableHead>
                            <TableHead className="w-[55%]">{tr("题目")}</TableHead>
                            <TableHead className="w-[35%]">{tr("参考答案")}</TableHead>
                            <TableHead className="w-16" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailPagedItems.map((item, i) => (
                            <TableRow key={item.id}>
                              <TableCell className="text-muted-foreground text-sm">
                                {(detailPage - 1) * PAGE_SIZE + i + 1}
                              </TableCell>
                              <TableCell className="max-w-[280px]">
                                <p className="truncate text-sm">{item.content}</p>
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm max-w-[160px]">
                                <div className="truncate">{item.answer || "—"}</div>
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive"
                                  onClick={() => deleteItem(item.id)}>{tr("删除")}</Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {detailTotalPages > 1 && (
                      <div className="flex items-center justify-center gap-3">
                        <Button variant="outline" size="sm" onClick={() => setDetailPage((p) => p - 1)} disabled={detailPage <= 1}>{tr("上一页")}</Button>
                        <span className="text-sm text-muted-foreground">{tr(`第 ${detailPage} / ${detailTotalPages} 页`)}</span>
                        <Button variant="outline" size="sm" onClick={() => setDetailPage((p) => p + 1)} disabled={detailPage >= detailTotalPages}>{tr("下一页")}</Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Add item dialog */}
        <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{tr("添加题目")}</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label>{tr("题目内容 *")}</Label>
                <Textarea value={newItem.content} onChange={(e) => setNewItem({ ...newItem, content: e.target.value })}
                  placeholder={tr("输入题目内容")} rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label>{tr("参考答案（可选）")}</Label>
                <Textarea value={newItem.answer} onChange={(e) => setNewItem({ ...newItem, answer: e.target.value })}
                  placeholder={tr("输入参考答案")} rows={2} />
              </div>
              <Button className="w-full" onClick={addItem} disabled={savingItem}>
                {savingItem ? tr("添加中...") : tr("添加")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
