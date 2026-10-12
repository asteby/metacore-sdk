import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { api } from '../../host'
import { type OrgUser } from '../data/types'

/** Org directory for DMs / groups — GET /internal-chat/users (not /data/users). */
export function useChatOrgUsers(open: boolean, currentUserId?: string) {
  const { t } = useTranslation()
  const [users, setUsers] = useState<OrgUser[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    api
      .get('/internal-chat/users')
      .then(({ data }) => {
        if (cancelled) return
        const list: OrgUser[] = (data?.users ?? []).map((u: OrgUser) => ({
          id: u.id,
          name: u.name || u.email || '—',
          email: u.email,
          avatar: u.avatar,
          online: u.online,
        }))
        setUsers(list.filter((u) => u.id !== currentUserId))
      })
      .catch(() => {
        if (!cancelled) {
          toast.error(t('team_chat.users_error', 'No se pudieron cargar los usuarios'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, currentUserId, t])

  return { users, loading }
}
