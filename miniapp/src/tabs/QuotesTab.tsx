import { useEffect, useState, useCallback } from 'react'
import { fetchQuotes, addQuote, deleteQuote } from '../api'
import type { Quote } from '../api'
import { AddIcon, TrashIcon, SmallSpinner } from '../icons'

type Filter = 'all' | 'unused' | 'used'

export default function QuotesTab() {
    const [quotes, setQuotes] = useState<Quote[]>([])
    const [stats, setStats] = useState({ total: 0, unusedCount: 0, usedCount: 0 })
    const [filter, setFilter] = useState<Filter>('all')
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(false)
    const [newText, setNewText] = useState('')
    const [saving, setSaving] = useState(false)
    const [deletingId, setDeletingId] = useState<number | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const d = await fetchQuotes(filter === 'all' ? undefined : filter, 50)
            setQuotes(d.quotes || [])
            setStats({ total: d.total, unusedCount: d.unusedCount, usedCount: d.usedCount })
        } finally {
            setLoading(false)
        }
    }, [filter])

    useEffect(() => { load() }, [load])

    const handleAdd = async () => {
        if (!newText.trim()) return
        setSaving(true)
        await addQuote(newText.trim())
        setNewText('')
        setAdding(false)
        setSaving(false)
        load()
    }

    const handleDelete = async (id: number) => {
        setDeletingId(id)
        await deleteQuote(id)
        setQuotes(q => q.filter(x => x.id !== id))
        setDeletingId(null)
    }

    const isUsed = (q: Quote) =>
        q.used_by_pages && q.used_by_pages !== '[]' && q.used_by_pages !== ''

    return (
        <div className="px-4 py-4 safe-bottom">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>คลังข้อความ</h2>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        ทั้งหมด {stats.total} | ยังไม่ใช้ {stats.unusedCount} | ใช้แล้ว {stats.usedCount}
                    </p>
                </div>
                <button
                    onClick={() => setAdding(true)}
                    className="w-10 h-10 rounded-2xl flex items-center justify-center tap-scale text-white"
                    style={{ background: 'var(--accent)' }}
                >
                    <AddIcon />
                </button>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 mb-4">
                {(['all', 'unused', 'used'] as Filter[]).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold tap-scale transition-colors"
                        style={{
                            background: filter === f ? 'var(--accent)' : 'var(--surface)',
                            color: filter === f ? 'white' : 'var(--muted)'
                        }}
                    >
                        {f === 'all' ? 'ทั้งหมด' : f === 'unused' ? 'ยังไม่ใช้' : 'ใช้แล้ว'}
                    </button>
                ))}
            </div>

            {/* Add Sheet */}
            {adding && (
                <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setAdding(false)}>
                    <div className="w-full p-4 rounded-t-3xl anim-slide-up" style={{ background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
                        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'rgba(0,0,0,0.15)' }} />
                        <p style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>เพิ่มข้อความใหม่</p>
                        <textarea
                            autoFocus
                            value={newText}
                            onChange={e => setNewText(e.target.value)}
                            placeholder="พิมพ์ข้อความที่ต้องการโพสต์..."
                            rows={4}
                            className="w-full rounded-2xl p-3 text-sm text-white resize-none outline-none"
                            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                        />
                        <div className="flex gap-3 mt-3">
                            <button
                                onClick={() => setAdding(false)}
                                className="flex-1 py-3 rounded-2xl text-sm font-bold tap-scale"
                                style={{ background: 'var(--surface2)', color: 'var(--muted)' }}
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={handleAdd}
                                disabled={saving || !newText.trim()}
                                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white tap-scale flex items-center justify-center gap-2"
                                style={{ background: 'var(--accent)', opacity: (!newText.trim()) ? 0.5 : 1 }}
                            >
                                {saving ? <SmallSpinner /> : 'บันทึก'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* List */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="w-8 h-8 border-2 rounded-full spin" style={{ borderColor: 'rgba(0,0,0,0.1)', borderTopColor: 'var(--accent)' }} />
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>กำลังโหลด...</p>
                </div>
            ) : quotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <p className="text-3xl">📭</p>
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>ไม่มีข้อความ</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {quotes.map((q, i) => (
                        <div
                            key={q.id}
                            className="rounded-2xl p-4 anim-fade-in-up"
                            style={{ background: 'var(--surface)', animationDelay: `${i * 40}ms` }}
                        >
                            <div className="flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                    <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>{q.quote_text}</p>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span
                                            className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                                            style={{
                                                background: isUsed(q) ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.15)',
                                                color: isUsed(q) ? '#22c55e' : '#818cf8'
                                            }}
                                        >
                                            {isUsed(q) ? '✓ ใช้แล้ว' : '⬡ ยังไม่ใช้'}
                                        </span>
                                        <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                                            {new Date(q.created_at).toLocaleDateString('th-TH')}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDelete(q.id)}
                                    disabled={deletingId === q.id}
                                    className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center tap-scale"
                                    style={{ background: 'var(--surface2)', color: '#ef4444' }}
                                >
                                    {deletingId === q.id ? <SmallSpinner /> : <TrashIcon />}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
