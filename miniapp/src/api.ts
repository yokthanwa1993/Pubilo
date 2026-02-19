export const API = 'https://api.pubilo.com'

export interface Page {
    id: string
    name: string
    picture?: { data?: { url?: string } }
    color: string
    auto_schedule: number
    has_token: boolean
}

export interface Quote {
    id: number
    quote_text: string
    used_by_pages?: string
    created_at: string
}

export interface Log {
    id: number
    page_id: string
    post_type: string
    quote_text: string
    status: string
    facebook_post_id?: string
    error_message?: string
    created_at: string
    share_status?: string
}

export interface PageSetting {
    page_id: string
    page_name: string
    post_token?: string
    comment_token?: string
    auto_schedule: number
    post_hours?: string
    page_color?: string
    picture_url?: string
    auto_hide_enabled?: number
    auto_hide_after_hours?: number
}

export interface Earnings {
    id: number
    page_id: string
    date: string
    amount: number
    currency: string
}

export const fetchPages = async (): Promise<Page[]> => {
    const r = await fetch(`${API}/api/pages`)
    const d = await r.json() as any
    return d.pages || []
}

export const fetchQuotes = async (filter?: string, limit = 30): Promise<{ quotes: Quote[], total: number, unusedCount: number, usedCount: number }> => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (filter) params.set('filter', filter)
    const r = await fetch(`${API}/api/quotes?${params}`)
    return r.json()
}

export const addQuote = async (content: string) => {
    const r = await fetch(`${API}/api/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
    })
    return r.json()
}

export const deleteQuote = async (id: number) => {
    await fetch(`${API}/api/quotes/${id}`, { method: 'DELETE' })
}

export const fetchLogs = async (pageId?: string, limit = 50): Promise<Log[]> => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (pageId) params.set('pageId', pageId)
    const r = await fetch(`${API}/api/logs?${params}`)
    const d = await r.json() as any
    return d.logs || []
}

export const fetchPageSetting = async (pageId: string): Promise<PageSetting | null> => {
    const r = await fetch(`${API}/api/page-settings?pageId=${pageId}`)
    const d = await r.json() as any
    return d.settings || null
}

export const savePageSetting = async (pageId: string, data: Partial<PageSetting>) => {
    const body: Record<string, any> = { pageId }
    if (data.auto_schedule !== undefined) body.autoSchedule = data.auto_schedule
    if (data.post_hours !== undefined) body.scheduleMinutes = data.post_hours
    if (data.post_token !== undefined) body.postToken = data.post_token
    if (data.comment_token !== undefined) body.hideToken = data.comment_token
    const r = await fetch(`${API}/api/page-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    return r.json()
}

export const fetchEarnings = async (pageId?: string): Promise<Earnings[]> => {
    const params = pageId ? `?pageId=${pageId}` : ''
    const r = await fetch(`${API}/api/earnings${params}`)
    const d = await r.json() as any
    return d.earnings || []
}

export const getTodayTH = () => {
    return new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0]
}

export const importPages = async (token: string) => {
    try {
        // Fetch pages from Facebook Graph API
        const r = await fetch(
            `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,picture,category&limit=100&access_token=${token}`
        )
        const data = await r.json() as any
        if (data.error) return { success: false, error: data.error.message }

        const fbPages: any[] = data.data || []
        let imported = 0, updated = 0

        for (const page of fbPages) {
            const pageToken = page.access_token || token
            const picUrl = page.picture?.data?.url || ''
            const colors = ['#f59e0b', '#6366f1', '#22c55e', '#ef4444', '#ec4899', '#14b8a6', '#f97316']
            const color = colors[Math.abs(parseInt(page.id.slice(-4), 16)) % colors.length]

            // Check if page already exists by checking page-settings
            const check = await fetch(`${API}/api/page-settings?pageId=${page.id}`)
            const checkData = await check.json() as any

            // Save/update settings
            await fetch(`${API}/api/page-settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pageId: page.id,
                    pageName: page.name,
                    pageColor: color,
                    pictureUrl: picUrl,
                    postToken: pageToken,
                })
            })

            if (checkData.settings?.page_name) updated++
            else imported++
        }
        return { success: true, imported, updated }
    } catch (e) {
        return { success: false, error: String(e) }
    }
}

export const triggerAutoPost = async () => {
    const r = await fetch(`${API}/api/cron/auto-post`, { method: 'GET' })
    return r.json()
}

export const checkTokenHealth = async () => {
    const r = await fetch(`${API}/api/token-health`)
    return r.json()
}
