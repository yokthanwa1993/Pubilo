import { useEffect, useState } from 'react'
import { fetchPageSetting, savePageSetting, importPages } from '../api'
import type { Page, PageSetting } from '../api'
import { BackIcon, SmallSpinner } from '../icons'

interface Props {
    pages: Page[]
    onRefresh: () => void
}

function PageDetail({ page, onBack }: { page: Page; onBack: () => void }) {
    const [, setSetting] = useState<PageSetting | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [isActive, setIsActive] = useState(false)
    const [editToken, setEditToken] = useState<'access' | 'comment' | null>(null)
    const [tokenVal, setTokenVal] = useState('')
    const [accessToken, setAccessToken] = useState('')
    const [commentToken, setCommentToken] = useState('')
    const [hourMinutes, setHourMinutes] = useState<Record<number, number>>({})

    useEffect(() => {
        fetchPageSetting(page.id).then(s => {
            if (s) {
                setSetting(s)
                setIsActive(s.auto_schedule === 1)
                setAccessToken(s.post_token || '')
                setCommentToken(s.comment_token || '')
                // parse post_hours
                const map: Record<number, number> = {}
                if (s.post_hours) {
                    for (const part of s.post_hours.split(',')) {
                        if (part.includes(':')) {
                            const [h, m] = part.split(':').map(Number)
                            if (h >= 1 && h <= 24) map[h] = m
                        } else {
                            const h = Number(part)
                            if (h >= 1 && h <= 24) map[h] = Math.floor(Math.random() * 59) + 1
                        }
                    }
                }
                setHourMinutes(map)
            }
            setLoading(false)
        })
    }, [page.id])

    const toggleHour = (h: number) => {
        setHourMinutes(prev => {
            const n = { ...prev }
            if (h in n) delete n[h]
            else n[h] = Math.floor(Math.random() * 59) + 1
            return n
        })
    }

    const selectedHours = Object.keys(hourMinutes).map(Number).sort((a, b) => a - b)
    const postHoursStr = selectedHours.map(h => `${h}:${hourMinutes[h].toString().padStart(2, '0')}`).join(',')

    const handleSave = async () => {
        setSaving(true)
        await savePageSetting(page.id, {
            auto_schedule: isActive ? 1 : 0,
            post_hours: postHoursStr,
            post_token: accessToken || undefined,
            comment_token: commentToken || undefined,
        })
        setSaving(false)
        onBack()
    }

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full spin" />
        </div>
    )

    return (
        <div className="px-4 py-4 flex flex-col min-h-[calc(100vh-70px)]">
            <button onClick={onBack} className="mb-4 w-9 h-9 flex items-center justify-center rounded-xl tap-scale" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
                <BackIcon />
            </button>

            {/* Page avatar */}
            <div className="flex flex-col items-center mb-5">
                <div className="w-20 h-20 rounded-2xl overflow-hidden mb-2" style={{ background: page.color }}>
                    {page.picture?.data?.url
                        ? <img src={page.picture.data.url} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold">{page.name[0]}</div>
                    }
                </div>
                <p className="text-base font-bold text-white">{page.name}</p>
            </div>

            {/* Auto Post toggle */}
            <div className="flex items-center justify-between p-4 rounded-2xl mb-3" style={{ background: 'var(--surface)' }}>
                <p className="font-bold text-white text-sm">Auto Post</p>
                <button
                    onClick={() => setIsActive(v => !v)}
                    className="w-12 h-6 rounded-full relative transition-colors"
                    style={{ background: isActive ? '#22c55e' : 'var(--surface2)' }}
                >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${isActive ? 'left-7' : 'left-1'}`} />
                </button>
            </div>

            {/* Tokens */}
            <div className="rounded-2xl overflow-hidden mb-3" style={{ background: 'var(--surface)' }}>
                {[
                    { key: 'access' as const, label: 'Access Token (โพสต์)', val: accessToken },
                    { key: 'comment' as const, label: 'Comment Token', val: commentToken },
                ].map((t, idx) => (
                    <div key={t.key}>
                        {idx > 0 && <div style={{ height: 1, background: 'var(--border)' }} />}
                        <button
                            onClick={() => { setEditToken(t.key); setTokenVal(t.val) }}
                            className="w-full flex items-center justify-between p-4 tap-scale"
                        >
                            <div className="text-left">
                                <p className="text-xs font-bold text-white">{t.label}</p>
                                <p className="text-[10px] mt-0.5 font-mono" style={{ color: 'var(--muted)' }}>
                                    {t.val ? `${t.val.slice(0, 18)}...` : 'ยังไม่ได้ตั้งค่า'}
                                </p>
                            </div>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--muted)' }}><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                    </div>
                ))}
            </div>

            {/* Token Edit Sheet */}
            {editToken && (
                <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setEditToken(null)}>
                    <div className="w-full p-4 rounded-t-3xl anim-slide-up" style={{ background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
                        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
                        <p className="text-sm font-bold text-white mb-3">
                            {editToken === 'access' ? 'Access Token' : 'Comment Token'}
                        </p>
                        <textarea
                            autoFocus
                            value={tokenVal}
                            onChange={e => setTokenVal(e.target.value)}
                            placeholder={editToken === 'access' ? 'วาง Page Access Token...' : 'วาง Comment Token (เว้นว่างได้)...'}
                            rows={4}
                            className="w-full rounded-2xl p-3 text-xs font-mono text-white resize-none outline-none"
                            style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
                        />
                        <div className="flex gap-3 mt-3">
                            <button onClick={() => setEditToken(null)} className="flex-1 py-3 rounded-2xl text-sm font-bold" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>ยกเลิก</button>
                            <button
                                onClick={() => {
                                    if (editToken === 'access') setAccessToken(tokenVal)
                                    else setCommentToken(tokenVal)
                                    setEditToken(null)
                                }}
                                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white"
                                style={{ background: 'var(--accent)' }}
                            >บันทึก</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Post Hours */}
            <div className="p-4 rounded-2xl mb-4" style={{ background: 'var(--surface)' }}>
                <p className="text-xs font-bold text-white mb-1">โพสต์เวลาไหนบ้าง</p>
                <p className="text-[10px] mb-3" style={{ color: 'var(--muted)' }}>กดเลือกได้หลายชั่วโมง</p>
                <div className="grid grid-cols-6 gap-1.5">
                    {Array.from({ length: 24 }, (_, i) => i + 1).map(h => (
                        <button
                            key={h}
                            onClick={() => toggleHour(h)}
                            className="py-2 rounded-lg text-xs font-semibold tap-scale"
                            style={{
                                background: selectedHours.includes(h) ? 'var(--accent)' : 'var(--surface2)',
                                color: selectedHours.includes(h) ? 'white' : 'var(--muted)'
                            }}
                        >
                            {String(h).padStart(2, '0')}
                        </button>
                    ))}
                </div>
                {selectedHours.length > 0 && (
                    <p className="text-[10px] mt-3" style={{ color: 'var(--accent2)' }}>
                        จะโพสต์: {selectedHours.map(h => `${String(h).padStart(2, '0')}:${String(hourMinutes[h]).padStart(2, '0')}`).join(', ')} น.
                    </p>
                )}
            </div>

            <div className="flex-1" />
            {/* Save */}
            <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-4 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2 tap-scale"
                style={{ background: saving ? 'var(--surface2)' : 'var(--accent)' }}
            >
                {saving ? <><SmallSpinner />กำลังบันทึก...</> : 'บันทึก'}
            </button>
        </div>
    )
}

export default function PagesTab({ pages, onRefresh }: Props) {
    const [selected, setSelected] = useState<Page | null>(null)
    const [showImport, setShowImport] = useState(false)
    const [importToken, setImportToken] = useState('')
    const [importing, setImporting] = useState(false)
    const [importMsg, setImportMsg] = useState('')

    const handleImport = async () => {
        if (!importToken.trim()) return
        setImporting(true)
        try {
            const d = await importPages(importToken.trim())
            if (d.success) {
                setImportMsg(`✅ เพิ่มใหม่ ${d.imported} เพจ, อัพเดท ${d.updated} เพจ`)
                setTimeout(() => { setShowImport(false); setImportMsg(''); setImportToken(''); onRefresh() }, 2000)
            } else {
                setImportMsg('❌ ' + (d.error || 'ไม่สำเร็จ'))
            }
        } catch {
            setImportMsg('❌ เชื่อมต่อไม่ได้')
        } finally {
            setImporting(false)
        }
    }

    if (selected) return <PageDetail page={selected} onBack={() => setSelected(null)} />

    return (
        <div className="px-4 py-4 safe-bottom">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">เพจทั้งหมด</h2>
                <button
                    onClick={() => setShowImport(true)}
                    className="text-xs font-semibold px-3 py-2 rounded-xl tap-scale"
                    style={{ background: 'var(--accent)', color: 'white' }}
                >
                    + นำเข้า
                </button>
            </div>

            {pages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <p className="text-3xl">📄</p>
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>ยังไม่มีเพจ กด + นำเข้า</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {pages.map((p, i) => (
                        <button
                            key={p.id}
                            onClick={() => setSelected(p)}
                            className="w-full flex items-center gap-3 p-3 rounded-2xl text-left tap-scale anim-fade-in-up"
                            style={{ background: 'var(--surface)', animationDelay: `${i * 40}ms` }}
                        >
                            <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0" style={{ background: p.color }}>
                                {p.picture?.data?.url
                                    ? <img src={p.picture.data.url} className="w-full h-full object-cover" />
                                    : <div className="w-full h-full flex items-center justify-center text-white font-bold">{p.name[0]}</div>
                                }
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] font-semibold" style={{ color: p.auto_schedule ? '#22c55e' : 'var(--muted)' }}>
                                        {p.auto_schedule ? '● Auto On' : '○ Auto Off'}
                                    </span>
                                    {!p.has_token && (
                                        <span className="text-[10px] font-semibold" style={{ color: '#ef4444' }}>⚠ ไม่มี Token</span>
                                    )}
                                </div>
                            </div>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--muted)' }}><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                    ))}
                </div>
            )}

            {/* Import Sheet */}
            {showImport && (
                <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowImport(false)}>
                    <div className="w-full p-4 rounded-t-3xl anim-slide-up" style={{ background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
                        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
                        <p className="text-base font-bold text-white mb-1">นำเข้า Facebook Pages</p>
                        <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>ใส่ User Access Token เพื่อดึงเพจที่คุณเป็นแอดมิน</p>
                        <textarea
                            autoFocus
                            value={importToken}
                            onChange={e => setImportToken(e.target.value)}
                            placeholder="วาง User Access Token..."
                            rows={4}
                            className="w-full rounded-2xl p-3 text-xs font-mono text-white resize-none outline-none"
                            style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
                        />
                        {importMsg && (
                            <p className="text-xs mt-2" style={{ color: importMsg.includes('✅') ? '#22c55e' : '#ef4444' }}>{importMsg}</p>
                        )}
                        <div className="flex gap-3 mt-3">
                            <button onClick={() => setShowImport(false)} className="flex-1 py-3 rounded-2xl text-sm font-bold" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>ยกเลิก</button>
                            <button
                                onClick={handleImport}
                                disabled={importing || !importToken.trim()}
                                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 tap-scale"
                                style={{ background: 'var(--accent)', opacity: !importToken.trim() ? 0.5 : 1 }}
                            >
                                {importing ? <><SmallSpinner />กำลังดึง...</> : 'นำเข้า Pages'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
