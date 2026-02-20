import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
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

            {/* Add Modal — centered, no keyboard */}
            {adding && createPortal(
                <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px', background: 'rgba(0,0,0,0.85)' }} onClick={() => { setAdding(false); setNewText('') }}>
                    <div style={{ width: '100%', maxWidth: 400, padding: 24, background: 'var(--surface)', borderRadius: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }} className="anim-fade-in" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <p style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>เพิ่มข้อความใหม่</p>
                            <button onClick={() => { setAdding(false); setNewText('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
                            </button>
                        </div>

                        {/* Paste-only — no keyboard */}
                        <div style={{ position: 'relative' }}>
                            <div
                                contentEditable
                                suppressContentEditableWarning
                                inputMode="none"
                                onPaste={(e) => {
                                    e.preventDefault()
                                    const text = e.clipboardData.getData('text/plain').trim()
                                    if (text) setNewText(text)
                                }}
                                onBeforeInput={(e) => e.preventDefault()}
                                onDrop={(e) => e.preventDefault()}
                                style={{
                                    minHeight: 100, borderRadius: 12, padding: '10px 12px',
                                    fontSize: 14, background: 'var(--surface2)',
                                    border: '1px solid var(--border)', color: 'var(--text)',
                                    outline: 'none', lineHeight: 1.7,
                                    WebkitUserSelect: 'text', userSelect: 'text',
                                } as React.CSSProperties}
                            >
                                {newText && <span>{newText}</span>}
                            </div>
                            {!newText && (
                                <p style={{ position: 'absolute', top: 10, left: 12, margin: 0, fontSize: 13, color: 'rgba(0,0,0,0.3)', pointerEvents: 'none' }}>
                                    กดค้างในช่องด้านบน → Paste ข้อความ
                                </p>
                            )}
                        </div>

                        <button
                            onClick={handleAdd}
                            disabled={saving || !newText.trim()}
                            style={{
                                width: '100%', marginTop: 14, padding: '14px',
                                borderRadius: 14, border: 'none', background: 'var(--accent)',
                                color: 'white', fontSize: 15, fontWeight: 700,
                                cursor: 'pointer', fontFamily: 'inherit',
                                opacity: !newText.trim() ? 0.4 : 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            }}
                        >
                            {saving ? <SmallSpinner /> : 'บันทึก'}
                        </button>
                    </div>
                </div>, document.body
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
                    {quotes.map((q) => (
                        <div
                            key={q.id}
                            className="rounded-2xl p-4"
                            style={{ background: 'var(--surface)' }}
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
