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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Bank {
  id: string;
  name: string;
  description: string;
  isSample: boolean;
  createdAt: string;
  _count: { items: number };
}

interface BankItem {
  id: string;
  content: string;
  answer: string | null;
  orderIndex: number;
}

interface BankDetail {
  id: string;
  name: string;
  description: string;
  isSample: boolean;
  items: BankItem[];
}

const PAGE_SIZE = 10;

export default function AccountQuestionBanksPage() {
  const { user, loading, authFetch } = useAuth();
  const router = useRouter();
  const [sampleBanks, setSampleBanks] = useState<Bank[]>([]);
  const [personalBanks, setPersonalBanks] = useState<Bank[]>([]);
  const [personalPage, setPersonalPage] = useState(1);

  // Create/edit bank dialog
  const [bankOpen, setBankOpen] = useState(false);
  const [editBankId, setEditBankId] = useState<string | null>(null);
  const [bankForm, setBankForm] = useState({ name: "", description: "" });
  const [savingBank, setSavingBank] = useState(false);

  // Import sample bank dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importingBankId, setImportingBankId] = useState<string | null>(null);
  const [previewBank, setPreviewBank] = useState<BankDetail | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null);

  // Detail dialog
  const [detail, setDetail] = useState<BankDetail | null>(null);
  const [detailPage, setDetailPage] = useState(1);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [newItem, setNewItem] = useState({ content: "", answer: "" });
  const [savingItem, setSavingItem] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadBankTemplate = () => {
    const csv = "\uFEFF" + [
      "question,answer,private",
      '"请描述大语言模型的主要特点","基于Transformer架构、通过大规模语料预训练的语言模型",0',
      '"什么是 RAG？","检索增强生成，将外部检索与语言模型生成结合的技术",0',
      '"写一个关于AI的故事（100字）","",1',
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
    const csv = "\uFEFF" + rows.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${bank.name}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (user.role !== "ADMIN" && !user.canPublish) router.replace("/not-found");
    }
  }, [user, loading, router]);

  const load = () =>
    authFetch("/api/user/question-banks")
      .then((r) => r.json())
      .then((d) => {
        setSampleBanks(d.sampleBanks || []);
        setPersonalBanks(d.personalBanks || []);
      });

  useEffect(() => { if (user) load(); }, [user]); // eslint-disable-line

  const loadDetail = (id: string) =>
    authFetch(`/api/user/question-banks/${id}`)
      .then((r) => r.json())
      .then((d) => { setDetail(d.bank); setDetailPage(1); });

  const personalTotalPages = Math.ceil(personalBanks.length / PAGE_SIZE);
  const pagedPersonal = personalBanks.slice((personalPage - 1) * PAGE_SIZE, personalPage * PAGE_SIZE);

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
    if (!bankForm.name.trim()) return toast.error("名称不能为空");
    setSavingBank(true);
    try {
      const url = editBankId ? `/api/user/question-banks/${editBankId}` : "/api/user/question-banks";
      const res = await authFetch(url, {
        method: editBankId ? "PUT" : "POST",
        body: JSON.stringify(bankForm),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setBankOpen(false);
      load();
      toast.success(editBankId ? "已更新" : "已创建");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失败");
    } finally {
      setSavingBank(false);
    }
  };

  const deleteBank = async (id: string) => {
    if (!confirm("确定删除该题库？题库内所有题目将一并删除。")) return;
    await authFetch(`/api/user/question-banks/${id}`, { method: "DELETE" });
    load();
    toast.success("已删除");
  };

  const loadPreview = async (bankId: string) => {
    setLoadingPreview(bankId);
    try {
      const res = await authFetch(`/api/user/question-banks/${bankId}`);
      const data = await res.json();
      setPreviewBank(data.bank);
    } catch {
      toast.error("加载失败");
    } finally {
      setLoadingPreview(null);
    }
  };

  const importSampleBank = async (bankId: string) => {
    setImportingBankId(bankId);
    try {
      const res = await authFetch("/api/user/question-banks/import-sample", {
        method: "POST",
        body: JSON.stringify({ bankId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setImportOpen(false);
      load();
      toast.success(`已导入「${data.bank.name}」，共 ${data.count} 道题目`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失败");
    } finally {
      setImportingBankId(null);
    }
  };

  const addItem = async () => {
    if (!detail || detail.isSample) return;
    if (!newItem.content.trim()) return toast.error("题目内容不能为空");
    setSavingItem(true);
    try {
      const res = await authFetch(`/api/user/question-banks/${detail.id}/items`, {
        method: "POST",
        body: JSON.stringify({ content: newItem.content, answer: newItem.answer }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setAddItemOpen(false);
      setNewItem({ content: "", answer: "" });
      await loadDetail(detail.id);
      load();
      toast.success("已添加");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失败");
    } finally {
      setSavingItem(false);
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!detail || detail.isSample) return;
    await authFetch(`/api/user/question-banks/${detail.id}/items/${itemId}`, { method: "DELETE" });
    await loadDetail(detail.id);
    load();
    toast.success("已删除");
  };

  const importBulk = async (csv: string) => {
    if (!detail || detail.isSample) return;
    try {
      const res = await authFetch(`/api/user/question-banks/${detail.id}/items`, {
        method: "POST",
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadDetail(detail.id);
      load();
      toast.success(`已导入 ${data.count} 道题目`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失败");
    }
  };

  const handleCSVFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => importBulk(ev.target?.result as string);
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  };

  const detailTotalPages = detail ? Math.ceil(detail.items.length / PAGE_SIZE) : 1;
  const detailPagedItems = detail ? detail.items.slice((detailPage - 1) * PAGE_SIZE, detailPage * PAGE_SIZE) : [];

  if (loading) return <div><Navbar /></div>;

  return (
    <div>
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">题库管理</h1>
            <p className="text-sm text-muted-foreground mt-1">管理个人题库，可导入到活动中使用。</p>
          </div>
          <div className="flex gap-2">
            {sampleBanks.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                导入样例题库
              </Button>
            )}
            <Button size="sm" onClick={openNew}>+ 创建题库</Button>
          </div>
        </div>

        {personalBanks.length === 0 ? (
          <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
            <p className="mb-3">还没有个人题库</p>
            <div className="flex items-center justify-center gap-2">
              {sampleBanks.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  导入样例题库
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={openNew}>创建第一个</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-border/60 overflow-hidden bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-medium">题库名称</TableHead>
                    <TableHead className="font-medium">描述</TableHead>
                    <TableHead className="w-20 text-center font-medium">题目数</TableHead>
                    <TableHead className="w-36" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedPersonal.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[240px] truncate">
                        {b.description || <span className="text-muted-foreground/40">无描述</span>}
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">{b._count.items}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                            onClick={() => loadDetail(b.id)}>查看</Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                            onClick={() => openEdit(b)}>编辑</Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive"
                            onClick={() => deleteBank(b.id)}>删除</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {personalTotalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-4">
                <Button variant="outline" size="sm" onClick={() => setPersonalPage((p) => p - 1)} disabled={personalPage <= 1}>上一页</Button>
                <span className="text-sm text-muted-foreground">第 {personalPage} / {personalTotalPages} 页</span>
                <Button variant="outline" size="sm" onClick={() => setPersonalPage((p) => p + 1)} disabled={personalPage >= personalTotalPages}>下一页</Button>
              </div>
            )}
          </>
        )}

        {/* Import sample bank dialog */}
        <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) setPreviewBank(null); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>导入样例题库</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">选择一个样例题库，将其复制为你的个人题库（名称自动加上「来自样例题库」标注）。</p>
            <div className={previewBank ? "grid grid-cols-2 gap-4" : "space-y-2"}>
              {/* Bank list */}
              <div className="space-y-2">
                {sampleBanks.map((b) => (
                  <div
                    key={b.id}
                    className={`rounded-lg border px-4 py-3 transition-colors ${previewBank?.id === b.id ? "border-primary/50 bg-primary/5" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{b.name}</p>
                        {b.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{b.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">{b._count.items} 道题目</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => previewBank?.id === b.id ? setPreviewBank(null) : loadPreview(b.id)}
                          disabled={loadingPreview === b.id}
                        >
                          {loadingPreview === b.id ? "..." : previewBank?.id === b.id ? "收起" : "预览"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => importSampleBank(b.id)}
                          disabled={importingBankId === b.id}
                        >
                          {importingBankId === b.id ? "导入中..." : "导入"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Preview panel */}
              {previewBank && (
                <div className="rounded-lg border overflow-hidden flex flex-col" style={{ maxHeight: 320 }}>
                  <div className="px-3 py-2 bg-muted/30 border-b shrink-0">
                    <p className="text-xs font-medium text-muted-foreground">预览：{previewBank.name}（{previewBank.items.length} 道）</p>
                  </div>
                  <div className="overflow-y-auto divide-y flex-1">
                    {previewBank.items.map((item, i) => (
                      <div key={item.id} className="px-3 py-2">
                        <p className="text-xs text-muted-foreground mb-0.5">#{i + 1}</p>
                        <p className="text-sm leading-snug">{item.content}</p>
                        {item.answer && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">答：{item.answer}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Create/edit bank dialog */}
        <Dialog open={bankOpen} onOpenChange={setBankOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editBankId ? "编辑题库" : "创建题库"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label>题库名称 *</Label>
                <Input value={bankForm.name} onChange={(e) => setBankForm({ ...bankForm, name: e.target.value })}
                  placeholder="例：常用题库" />
              </div>
              <div className="space-y-1.5">
                <Label>描述（可选）</Label>
                <Input value={bankForm.description} onChange={(e) => setBankForm({ ...bankForm, description: e.target.value })}
                  placeholder="简要说明题库内容" />
              </div>
              <Button className="w-full" onClick={saveBank} disabled={savingBank}>
                {savingBank ? "保存中..." : "保存"}
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
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm text-muted-foreground">{detail.items.length} 道题目</p>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={downloadBankTemplate}>CSV 模板</Button>
                    {detail.items.length > 0 && (
                      <Button size="sm" variant="outline" onClick={() => exportBankCSV(detail)}>导出 CSV</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                      CSV 导入
                    </Button>
                    <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVFile} />
                    <Button size="sm" onClick={() => { setNewItem({ content: "", answer: "" }); setAddItemOpen(true); }}>
                      + 添加题目
                    </Button>
                  </div>
                </div>

                {detail.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">题库为空。</p>
                ) : (
                  <>
                    <div className="rounded-lg border overflow-hidden">
                      <Table className="table-fixed">
                        <TableHeader>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead className="w-10">#</TableHead>
                            <TableHead className="w-[55%]">题目</TableHead>
                            <TableHead className="w-[35%]">参考答案</TableHead>
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
                                  onClick={() => deleteItem(item.id)}>删除</Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {detailTotalPages > 1 && (
                      <div className="flex items-center justify-center gap-3">
                        <Button variant="outline" size="sm" onClick={() => setDetailPage((p) => p - 1)} disabled={detailPage <= 1}>上一页</Button>
                        <span className="text-sm text-muted-foreground">第 {detailPage} / {detailTotalPages} 页</span>
                        <Button variant="outline" size="sm" onClick={() => setDetailPage((p) => p + 1)} disabled={detailPage >= detailTotalPages}>下一页</Button>
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
            <DialogHeader><DialogTitle>添加题目</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label>题目内容 *</Label>
                <Textarea value={newItem.content} onChange={(e) => setNewItem({ ...newItem, content: e.target.value })}
                  placeholder="输入题目内容" rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label>参考答案（可选）</Label>
                <Textarea value={newItem.answer} onChange={(e) => setNewItem({ ...newItem, answer: e.target.value })}
                  placeholder="输入参考答案" rows={2} />
              </div>
              <Button className="w-full" onClick={addItem} disabled={savingItem}>
                {savingItem ? "添加中..." : "添加"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
