'use client'
import { useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Navigation } from '@/components/Navigation'
import { trpc } from '@/lib/trpc'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus, Pencil, Trash2, Users, Building2, ShieldAlert,
  Upload, Download, Copy, Check, FileJson, FileText,
  Database, Sparkles, X, AlertCircle, ChevronDown,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────
type FacilityRaw  = { id: string; name: string; type: string; district: string; block: string; lat: number; lng: number; metadata?: Record<string, unknown> | null }
type FacilityRow  = FacilityRaw & { phone?: string | null }
type DialogMode   = { type: 'create' } | { type: 'edit'; facility: FacilityRow } | null
type ImportEntity = 'facilities' | 'users' | 'sensors'
type Tab          = 'users' | 'facilities' | 'import' | 'export'

// Helper: extract phone from metadata JSON
function facilityWithPhone(f: FacilityRaw): FacilityRow {
  const meta = f.metadata && typeof f.metadata === 'object' ? f.metadata : {}
  return { ...f, phone: (meta as any).phone ?? null }
}

// ── CSV / JSON helpers ───────────────────────────────────────────
const FACILITY_HEADERS = ['name', 'type', 'district', 'block', 'lat', 'lng']
const USER_HEADERS     = ['name', 'email', 'phone', 'role', 'district', 'block']
const SENSOR_HEADERS   = ['facilityId', 'sensorType', 'value', 'unit', 'qualityFlag', 'timestamp']

const FACILITY_TYPES = ['SCHOOL', 'PHC', 'CHC', 'ANGANWADI']
const USER_ROLES     = ['ADMIN','STATE_OFFICER','DISTRICT_OFFICER','BLOCK_ENGINEER','HEADMASTER','ANM','VIEWER']
const SENSOR_TYPES   = ['WATER_LEVEL','SOLAR_OUTPUT','TEMPERATURE','CHLORINE','TURBIDITY','HUMIDITY','BATTERY']
const QUALITY_FLAGS  = ['GOOD','SUSPECT','BAD','MISSING']

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
}

function parseJSON(text: string): Record<string, string>[] {
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch { return [] }
}

function autoDetect(text: string): 'csv' | 'json' | null {
  const t = text.trim()
  if (t.startsWith('[') || t.startsWith('{')) return 'json'
  if (t.includes(',')) return 'csv'
  return null
}

function toCSV(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => `"${String(r[h] ?? '')}"`).join(',')),
  ]
  return lines.join('\n')
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function validateFacilityRow(row: Record<string, string>): string | null {
  if (!row.name)   return 'Missing name'
  if (!FACILITY_TYPES.includes(row.type?.toUpperCase())) return `Invalid type "${row.type}"`
  if (!row.district) return 'Missing district'
  if (!row.block)    return 'Missing block'
  if (isNaN(parseFloat(row.lat))) return `Invalid lat "${row.lat}"`
  if (isNaN(parseFloat(row.lng))) return `Invalid lng "${row.lng}"`
  return null
}

function validateUserRow(row: Record<string, string>): string | null {
  if (!row.name)  return 'Missing name'
  if (!row.email && !row.phone) return 'Need email or phone'
  if (!USER_ROLES.includes(row.role?.toUpperCase())) return `Invalid role "${row.role}"`
  return null
}

function validateSensorRow(row: Record<string, string>): string | null {
  if (!row.facilityId) return 'Missing facilityId'
  if (!SENSOR_TYPES.includes(row.sensorType?.toUpperCase())) return `Invalid sensorType "${row.sensorType}"`
  if (isNaN(parseFloat(row.value))) return `Invalid value "${row.value}"`
  if (!row.unit) return 'Missing unit'
  if (!row.timestamp) return 'Missing timestamp'
  if (isNaN(Date.parse(row.timestamp))) return `Invalid timestamp "${row.timestamp}"`
  return null
}

// ── Root page ────────────────────────────────────────────────────
export default function AdminPage() {
  const { data: session, status } = useSession()

  if (status === 'loading') return (
    <div className="min-h-screen bg-forest">
      <Navigation />
      <div className="pt-[72px] px-[7vw] py-6">
        <Skeleton className="h-10 w-48 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  )

  if (!session || (session.user as any)?.role !== 'ADMIN') return (
    <div className="min-h-screen bg-forest flex items-center justify-center">
      <div className="text-center p-8 bg-charcoal/80 border border-teal/20 rounded-xl backdrop-blur-sm max-w-md mx-4">
        <ShieldAlert className="w-16 h-16 text-danger mx-auto mb-4" />
        <h2 className="font-sora font-bold text-xl text-white mb-2">Access Denied</h2>
        <p className="text-white/50">This page is restricted to ADMIN users only.</p>
      </div>
    </div>
  )

  return <AdminContent />
}

// ── Admin content ────────────────────────────────────────────────
function AdminContent() {
  const [tab, setTab] = useState<Tab>('facilities')

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'facilities', label: 'Facilities', icon: <Building2 className="w-4 h-4" /> },
    { id: 'users',      label: 'Users',      icon: <Users className="w-4 h-4" /> },
    { id: 'import',     label: 'Import Data',icon: <Upload className="w-4 h-4" /> },
    { id: 'export',     label: 'Export',     icon: <Download className="w-4 h-4" /> },
  ]

  return (
    <div className="min-h-screen bg-forest">
      <Navigation />
      <div className="pt-[72px]">
        <div className="bg-charcoal border-b border-teal/20 px-[7vw] py-6">
          <h1 className="font-sora font-bold text-2xl text-white mb-1">Admin Panel</h1>
          <p className="text-white/50">Manage users, facilities, and bulk data operations</p>
          <div className="flex gap-2 mt-6 flex-wrap">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-teal/10 text-teal border border-teal/30'
                    : 'text-white/50 hover:bg-dark/50 border border-transparent'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-[7vw] py-6">
          {tab === 'facilities' && <FacilitiesTab />}
          {tab === 'users'      && <UsersTab />}
          {tab === 'import'     && <ImportTab />}
          {tab === 'export'     && <ExportTab />}
        </div>
      </div>
    </div>
  )
}

// ── Users tab ────────────────────────────────────────────────────
type UserRow = { id: string; name: string; email?: string | null; phone?: string | null; role: string; district?: string | null; block?: string | null; createdAt: string }
type UserDialogMode = { type: 'create' } | { type: 'editRole'; user: UserRow } | null

function UsersTab() {
  const utils = trpc.useUtils()
  const [copied, setCopied] = useState<string | null>(null)
  const [dialogMode, setDialogMode] = useState<UserDialogMode>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null)
  const [userForm, setUserForm] = useState({ name: '', email: '', role: 'VIEWER', phone: '', district: '', block: '' })
  const [roleEdit, setRoleEdit] = useState('VIEWER')
  const { data: users = [], isLoading } = trpc.admin.users.useQuery()

  const createUser = trpc.admin.createUser.useMutation({
    onSuccess: () => { utils.admin.users.invalidate(); setDialogMode(null) },
  })
  const updateUserRole = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => { utils.admin.users.invalidate(); setDialogMode(null) },
  })
  const deleteUser = trpc.admin.deleteUser.useMutation({
    onSuccess: () => { utils.admin.users.invalidate(); setDeleteTarget(null) },
  })

  const openCreate = () => {
    setUserForm({ name: '', email: '', role: 'VIEWER', phone: '', district: '', block: '' })
    setDialogMode({ type: 'create' })
  }
  const openEditRole = (u: UserRow) => {
    setRoleEdit(u.role)
    setDialogMode({ type: 'editRole', user: u })
  }

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createUser.mutate({
      name: userForm.name,
      email: userForm.email,
      role: userForm.role as any,
      phone: userForm.phone || undefined,
      district: userForm.district || undefined,
      block: userForm.block || undefined,
    })
  }

  const copyRow = (u: (typeof users)[0]) => {
    const text = `${u.name},${u.email ?? ''},${u.phone ?? ''},${u.role},${u.district ?? ''},${u.block ?? ''}`
    navigator.clipboard.writeText(text)
    setCopied(u.id)
    setTimeout(() => setCopied(null), 1500)
  }

  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <p className="text-white/50 text-sm">{users.length} users total</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const csv = toCSV(USER_HEADERS, users as any)
              downloadFile(csv, 'users.csv', 'text/csv')
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-white/60 hover:text-teal border border-teal/20 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <Button onClick={openCreate} className="bg-teal hover:bg-teal/90 text-white flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add User
          </Button>
        </div>
      </div>
      <div className="bg-charcoal/80 border border-teal/20 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-dark/50 border-b border-teal/20">
                {['Name', 'Email / Phone', 'Role', 'District', 'Created', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs text-white/50 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-white/40">No users found</td></tr>
              ) : (users as UserRow[]).map(u => (
                <tr key={u.id} className="border-b border-teal/10 hover:bg-teal/5">
                  <td className="px-4 py-3 text-sm font-medium text-white">{u.name}</td>
                  <td className="px-4 py-3 text-sm text-white/50">{u.email ?? u.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-mono ${
                      u.role === 'ADMIN' ? 'bg-orange/10 text-orange' : 'bg-teal/10 text-teal'
                    }`}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-white/50">{u.district ?? '—'}</td>
                  <td className="px-4 py-3 text-xs font-mono text-white/50">
                    {new Date(u.createdAt).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => copyRow(u)} className="p-1.5 hover:bg-teal/10 rounded text-white/30 hover:text-teal transition-colors" title="Copy row as CSV">
                        {copied === u.id ? <Check className="w-3.5 h-3.5 text-teal" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => openEditRole(u)} className="p-1.5 hover:bg-teal/10 rounded text-white/30 hover:text-teal transition-colors" title="Change role">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(u)} className="p-1.5 hover:bg-danger/10 rounded text-white/30 hover:text-danger transition-colors" title="Delete user">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Dialog */}
      <Dialog open={dialogMode?.type === 'create'} onOpenChange={() => setDialogMode(null)}>
        <DialogContent className="sm:max-w-md bg-charcoal border-teal/20">
          <DialogHeader>
            <DialogTitle className="text-white">Add User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div>
              <Label className="text-white/70">Name *</Label>
              <Input value={userForm.name} onChange={e => setUserForm(p => ({ ...p, name: e.target.value }))} required className="bg-forest border-teal/20 text-white" />
            </div>
            <div>
              <Label className="text-white/70">Email *</Label>
              <Input type="email" value={userForm.email} onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))} required className="bg-forest border-teal/20 text-white" />
            </div>
            <div>
              <Label className="text-white/70">Role</Label>
              <select value={userForm.role} onChange={e => setUserForm(p => ({ ...p, role: e.target.value }))} className="w-full mt-1.5 px-3 py-2 rounded-md bg-forest border border-teal/20 text-white text-sm focus:outline-none focus:border-teal">
                {USER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-white/70">Phone</Label>
              <Input value={userForm.phone} onChange={e => setUserForm(p => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" className="bg-forest border-teal/20 text-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-white/70">District</Label><Input value={userForm.district} onChange={e => setUserForm(p => ({ ...p, district: e.target.value }))} className="bg-forest border-teal/20 text-white" /></div>
              <div><Label className="text-white/70">Block</Label><Input value={userForm.block} onChange={e => setUserForm(p => ({ ...p, block: e.target.value }))} className="bg-forest border-teal/20 text-white" /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogMode(null)}>Cancel</Button>
              <Button type="submit" disabled={createUser.isPending} className="bg-teal hover:bg-teal/90 text-white">
                {createUser.isPending ? 'Creating…' : 'Create User'}
              </Button>
            </DialogFooter>
            {createUser.isError && <p className="text-xs text-danger">{createUser.error.message}</p>}
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={dialogMode?.type === 'editRole'} onOpenChange={() => setDialogMode(null)}>
        <DialogContent className="sm:max-w-sm bg-charcoal border-teal/20">
          <DialogHeader>
            <DialogTitle className="text-white">Change Role</DialogTitle>
          </DialogHeader>
          {dialogMode?.type === 'editRole' && (
            <div className="space-y-4">
              <p className="text-sm text-white/60">
                Updating role for <strong className="text-white">{dialogMode.user.name}</strong> ({dialogMode.user.email})
              </p>
              <select
                value={roleEdit}
                onChange={e => setRoleEdit(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-forest border border-teal/20 text-white text-sm focus:outline-none focus:border-teal"
              >
                {USER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogMode(null)}>Cancel</Button>
                <Button
                  disabled={updateUserRole.isPending}
                  onClick={() => dialogMode.type === 'editRole' && updateUserRole.mutate({ id: dialogMode.user.id, role: roleEdit as any })}
                  className="bg-teal hover:bg-teal/90 text-white"
                >
                  {updateUserRole.isPending ? 'Saving…' : 'Save Role'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete User Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently remove <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email}). They will no longer be able to log in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteUser.mutate({ id: deleteTarget.id })}
              className="bg-danger hover:bg-danger/90 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ── Facilities tab ───────────────────────────────────────────────
function FacilitiesTab() {
  const utils = trpc.useUtils()
  const { data: rawFacilities = [], isLoading } = trpc.admin.facilities.useQuery()
  const facilities = (rawFacilities as FacilityRaw[]).map(facilityWithPhone)
  const [dialogMode, setDialogMode]   = useState<DialogMode>(null)
  const [deleteTarget, setDeleteTarget] = useState<FacilityRow | null>(null)
  const [copied, setCopied]           = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', type: 'SCHOOL', district: '', block: '', lat: '', lng: '', phone: '' })

  const openCreate = () => { setForm({ name: '', type: 'SCHOOL', district: '', block: '', lat: '', lng: '', phone: '' }); setDialogMode({ type: 'create' }) }
  const openEdit   = (f: FacilityRow) => { setForm({ name: f.name, type: f.type, district: f.district, block: f.block, lat: String(f.lat), lng: String(f.lng), phone: f.phone ?? '' }); setDialogMode({ type: 'edit', facility: f }) }
  const invalidate = () => { utils.admin.facilities.invalidate(); utils.facilities.list.invalidate() }

  const createFacility = trpc.admin.createFacility.useMutation({ onSuccess: () => { invalidate(); setDialogMode(null) } })
  const updateFacility = trpc.admin.updateFacility.useMutation({ onSuccess: () => { invalidate(); setDialogMode(null) } })
  const deleteFacility = trpc.admin.deleteFacility.useMutation({ onSuccess: () => { invalidate(); setDeleteTarget(null) } })
  const seedDemo       = trpc.admin.seedDemoData.useMutation({ onSuccess: () => invalidate() })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = { name: form.name, type: form.type as any, district: form.district, block: form.block, lat: parseFloat(form.lat), lng: parseFloat(form.lng), phone: form.phone || undefined }
    dialogMode?.type === 'edit' ? updateFacility.mutate({ id: dialogMode.facility.id, ...payload }) : createFacility.mutate(payload)
  }

  const copyRow = (f: FacilityRow) => {
    navigator.clipboard.writeText(`${f.name},${f.type},${f.district},${f.block},${f.lat},${f.lng}`)
    setCopied(f.id); setTimeout(() => setCopied(null), 1500)
  }

  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <p className="text-white/50 text-sm">{facilities.length} facilities total</p>
        <div className="flex items-center gap-2 flex-wrap">
          {facilities.length === 0 && (
            <Button
              onClick={() => seedDemo.mutate()}
              disabled={seedDemo.isPending}
              variant="outline"
              className="flex items-center gap-2 border-orange/30 text-orange hover:bg-orange/10 text-sm"
            >
              <Sparkles className="w-4 h-4" />
              {seedDemo.isPending ? 'Seeding…' : 'Seed Demo Data'}
            </Button>
          )}
          <button
            onClick={() => downloadFile(toCSV(FACILITY_HEADERS, facilities as any), 'facilities.csv', 'text/csv')}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-white/60 hover:text-teal border border-teal/20 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            onClick={() => downloadFile(JSON.stringify(facilities, null, 2), 'facilities.json', 'application/json')}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-white/60 hover:text-teal border border-teal/20 rounded-lg transition-colors"
          >
            <FileJson className="w-3.5 h-3.5" /> JSON
          </button>
          <Button onClick={openCreate} className="bg-teal hover:bg-teal/90 text-white flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Facility
          </Button>
        </div>
      </div>

      <div className="bg-charcoal/80 border border-teal/20 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-dark/50 border-b border-teal/20">
                {['Name', 'Type', 'District', 'Block', 'Coordinates', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs text-white/50 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facilities.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-white/40">No facilities. Click "Seed Demo Data" or use the Import tab.</td></tr>
              ) : (facilities as FacilityRow[]).map(f => (
                <tr key={f.id} className="border-b border-teal/10 hover:bg-teal/5">
                  <td className="px-4 py-3 text-sm font-medium text-white">{f.name}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 bg-teal/10 text-teal text-xs rounded-full font-mono">{f.type}</span></td>
                  <td className="px-4 py-3 text-sm text-white/50">{f.district}</td>
                  <td className="px-4 py-3 text-sm text-white/50">{f.block}</td>
                  <td className="px-4 py-3 text-xs font-mono text-white/50">{f.lat.toFixed(4)}, {f.lng.toFixed(4)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => copyRow(f)} className="p-1.5 hover:bg-teal/10 rounded text-white/30 hover:text-teal transition-colors" title="Copy as CSV">
                        {copied === f.id ? <Check className="w-3.5 h-3.5 text-teal" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => openEdit(f)} className="p-1.5 hover:bg-teal/10 rounded text-white/30 hover:text-teal transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(f)} className="p-1.5 hover:bg-danger/10 rounded text-white/30 hover:text-danger transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogMode !== null} onOpenChange={() => setDialogMode(null)}>
        <DialogContent className="sm:max-w-md bg-charcoal border-teal/20">
          <DialogHeader>
            <DialogTitle className="text-white">{dialogMode?.type === 'edit' ? 'Edit Facility' : 'Create Facility'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-white/70">Name</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className="bg-forest border-teal/20 text-white" />
            </div>
            <div>
              <Label className="text-white/70">Type</Label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="w-full mt-1.5 px-3 py-2 rounded-md bg-forest border border-teal/20 text-white text-sm focus:outline-none focus:border-teal">
                {FACILITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-white/70">District</Label><Input value={form.district} onChange={e => setForm(p => ({ ...p, district: e.target.value }))} required className="bg-forest border-teal/20 text-white" /></div>
              <div><Label className="text-white/70">Block</Label><Input value={form.block} onChange={e => setForm(p => ({ ...p, block: e.target.value }))} required className="bg-forest border-teal/20 text-white" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-white/70">Latitude</Label><Input type="number" step="0.0001" value={form.lat} onChange={e => setForm(p => ({ ...p, lat: e.target.value }))} required className="bg-forest border-teal/20 text-white" /></div>
              <div><Label className="text-white/70">Longitude</Label><Input type="number" step="0.0001" value={form.lng} onChange={e => setForm(p => ({ ...p, lng: e.target.value }))} required className="bg-forest border-teal/20 text-white" /></div>
            </div>
            <div>
              <Label className="text-white/70">Phone</Label>
              <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" className="bg-forest border-teal/20 text-white" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogMode(null)}>Cancel</Button>
              <Button type="submit" disabled={createFacility.isPending || updateFacility.isPending} className="bg-teal hover:bg-teal/90 text-white">
                {dialogMode?.type === 'edit' ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Facility?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently deletes <strong>{deleteTarget?.name}</strong> and all its sensor readings, alerts, and risk scores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteFacility.mutate({ id: deleteTarget.id })} className="bg-danger hover:bg-danger/90 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ── Import tab ───────────────────────────────────────────────────
type ParsedRow = { data: Record<string, string>; error: string | null }

function ImportTab() {
  const utils = trpc.useUtils()
  const [entity, setEntity]       = useState<ImportEntity>('facilities')
  const [text, setText]           = useState('')
  const [parsed, setParsed]       = useState<ParsedRow[] | null>(null)
  const [format, setFormat]       = useState<'csv' | 'json' | null>(null)
  const [result, setResult]       = useState<{ count: number } | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [dragging, setDragging]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const ENTITY_OPTS: { id: ImportEntity; label: string }[] = [
    { id: 'facilities', label: 'Facilities' },
    { id: 'users',      label: 'Users' },
    { id: 'sensors',    label: 'Sensor Readings' },
  ]

  const HEADERS = entity === 'facilities' ? FACILITY_HEADERS : entity === 'users' ? USER_HEADERS : SENSOR_HEADERS
  const TEMPLATE_ROW = entity === 'facilities'
    ? 'Govt. School Example,SCHOOL,Raipur,Arang,21.1983,81.9712'
    : entity === 'users'
    ? 'John Doe,john@example.com,,BLOCK_ENGINEER,Raipur,Arang'
    : 'facility_id_here,WATER_LEVEL,34.5,%,GOOD,2026-03-08T10:00:00.000Z'

  const validate = useCallback((rows: Record<string, string>[]): ParsedRow[] => {
    return rows.map(row => ({
      data: row,
      error: entity === 'facilities' ? validateFacilityRow(row)
           : entity === 'users'      ? validateUserRow(row)
           : validateSensorRow(row),
    }))
  }, [entity])

  const parse = () => {
    setResult(null); setError(null)
    const fmt = autoDetect(text)
    if (!fmt) { setError('Could not detect format. Use CSV (comma-separated) or JSON array.'); return }
    setFormat(fmt)
    const rows = fmt === 'csv' ? parseCSV(text) : parseJSON(text)
    if (rows.length === 0) { setError('No rows found after parsing.'); return }
    setParsed(validate(rows))
  }

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => { setText(e.target?.result as string ?? '') }
    reader.readAsText(file)
  }

  const bulkFacilities = trpc.admin.bulkCreateFacilities.useMutation({
    onSuccess: r => { setResult(r); utils.admin.facilities.invalidate(); utils.facilities.list.invalidate() },
    onError: e => setError(e.message),
  })
  const bulkUsers = trpc.admin.bulkCreateUsers.useMutation({
    onSuccess: r => { setResult(r); utils.admin.users.invalidate() },
    onError: e => setError(e.message),
  })
  const bulkSensors = trpc.admin.bulkCreateSensorReadings.useMutation({
    onSuccess: r => { setResult(r) },
    onError: e => setError(e.message),
  })

  const validRows = parsed?.filter(r => !r.error) ?? []
  const isPending = bulkFacilities.isPending || bulkUsers.isPending || bulkSensors.isPending

  const commit = () => {
    if (validRows.length === 0) return
    setError(null)
    if (entity === 'facilities') {
      bulkFacilities.mutate({ facilities: validRows.map(r => ({
        name: r.data.name, type: r.data.type.toUpperCase() as any,
        district: r.data.district, block: r.data.block,
        lat: parseFloat(r.data.lat), lng: parseFloat(r.data.lng),
      })) })
    } else if (entity === 'users') {
      bulkUsers.mutate({ users: validRows.map(r => ({
        name: r.data.name, email: r.data.email || undefined,
        phone: r.data.phone || undefined, role: r.data.role.toUpperCase() as any,
        district: r.data.district || undefined, block: r.data.block || undefined,
      })) })
    } else {
      bulkSensors.mutate({ readings: validRows.map(r => ({
        facilityId: r.data.facilityId, sensorType: r.data.sensorType.toUpperCase() as any,
        value: parseFloat(r.data.value), unit: r.data.unit,
        qualityFlag: (r.data.qualityFlag?.toUpperCase() || 'GOOD') as any,
        timestamp: new Date(r.data.timestamp).toISOString(),
      })) })
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Entity selector */}
      <div className="bg-charcoal/80 border border-teal/20 rounded-xl p-5">
        <h2 className="font-sora font-semibold text-white mb-4">1. Choose data type</h2>
        <div className="flex gap-3 flex-wrap">
          {ENTITY_OPTS.map(o => (
            <button
              key={o.id}
              onClick={() => { setEntity(o.id); setParsed(null); setResult(null); setError(null) }}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                entity === o.id ? 'bg-teal/10 border-teal/30 text-teal' : 'border-teal/10 text-white/50 hover:bg-teal/5'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="mt-4 p-3 bg-dark/50 rounded-lg">
          <p className="text-xs text-white/40 font-mono mb-1">CSV template ({entity}):</p>
          <p className="text-xs text-teal/70 font-mono">{HEADERS.join(',')}</p>
          <p className="text-xs text-white/30 font-mono">{TEMPLATE_ROW}</p>
          <button
            onClick={() => downloadFile(`${HEADERS.join(',')}\n${TEMPLATE_ROW}`, `${entity}_template.csv`, 'text/csv')}
            className="mt-2 flex items-center gap-1.5 text-xs text-teal/60 hover:text-teal transition-colors"
          >
            <Download className="w-3 h-3" /> Download template
          </button>
        </div>
      </div>

      {/* File drop + paste */}
      <div className="bg-charcoal/80 border border-teal/20 rounded-xl p-5">
        <h2 className="font-sora font-semibold text-white mb-4">2. Upload or paste data</h2>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors mb-4 ${
            dragging ? 'border-teal bg-teal/5' : 'border-teal/20 hover:border-teal/40 hover:bg-teal/5'
          }`}
        >
          <Upload className="w-8 h-8 text-teal/40 mx-auto mb-2" />
          <p className="text-white/50 text-sm">Drop a <span className="text-teal">.csv</span> or <span className="text-teal">.json</span> file here, or click to browse</p>
          <input ref={fileRef} type="file" accept=".csv,.json,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>

        {/* Paste area */}
        <div className="relative">
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setParsed(null); setResult(null) }}
            placeholder={`Paste CSV or JSON here…\n\n${HEADERS.join(',')}\n${TEMPLATE_ROW}`}
            rows={8}
            className="w-full px-4 py-3 bg-forest/80 border border-teal/20 rounded-xl text-sm font-mono text-white/80 placeholder:text-white/20 focus:outline-none focus:border-teal resize-y"
          />
          {text && (
            <button onClick={() => { setText(''); setParsed(null); setResult(null) }} className="absolute top-2 right-2 p-1 text-white/30 hover:text-white/60">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 mt-3">
          <Button onClick={parse} disabled={!text.trim()} className="bg-teal hover:bg-teal/90 text-white">
            Parse & Preview
          </Button>
          {format && <span className="text-xs text-white/40 font-mono uppercase">{format} detected</span>}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-danger/10 border border-danger/30 rounded-xl">
          <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {/* Success */}
      {result && (
        <div className="flex items-center gap-3 p-4 bg-teal/10 border border-teal/30 rounded-xl">
          <Check className="w-5 h-5 text-teal" />
          <p className="text-sm text-teal font-medium">{result.count} records inserted successfully.</p>
        </div>
      )}

      {/* Preview table */}
      {parsed && parsed.length > 0 && (
        <div className="bg-charcoal/80 border border-teal/20 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-teal/20">
            <div>
              <h2 className="font-sora font-semibold text-white">3. Review & Import</h2>
              <p className="text-xs text-white/40 mt-0.5">
                {validRows.length} valid · {parsed.length - validRows.length} errors
              </p>
            </div>
            <Button
              onClick={commit}
              disabled={isPending || validRows.length === 0}
              className="bg-teal hover:bg-teal/90 text-white flex items-center gap-2"
            >
              <Database className="w-4 h-4" />
              {isPending ? 'Importing…' : `Import ${validRows.length} rows`}
            </Button>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-xs font-mono">
              <thead className="sticky top-0 bg-dark/90">
                <tr className="border-b border-teal/20">
                  <th className="px-3 py-2 text-left text-white/40 w-8">#</th>
                  {HEADERS.map(h => <th key={h} className="px-3 py-2 text-left text-white/40">{h}</th>)}
                  <th className="px-3 py-2 text-left text-white/40">status</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((row, i) => (
                  <tr key={i} className={`border-b border-teal/10 ${row.error ? 'bg-danger/5' : 'hover:bg-teal/5'}`}>
                    <td className="px-3 py-2 text-white/30">{i + 1}</td>
                    {HEADERS.map(h => (
                      <td key={h} className="px-3 py-2 text-white/70 max-w-[160px] truncate">
                        {row.data[h] ?? '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      {row.error
                        ? <span className="text-danger flex items-center gap-1"><AlertCircle className="w-3 h-3" />{row.error}</span>
                        : <span className="text-teal"><Check className="w-3 h-3 inline" /> ok</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Export tab ───────────────────────────────────────────────────
function ExportTab() {
  const { data: facilities = [] } = trpc.admin.facilities.useQuery()
  const { data: users = [] }      = trpc.admin.users.useQuery()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key); setTimeout(() => setCopiedKey(null), 1500)
  }

  const EXPORTS = [
    {
      key: 'facilities-csv',
      label: 'Facilities',
      format: 'CSV',
      icon: <FileText className="w-5 h-5 text-teal" />,
      count: facilities.length,
      onDownload: () => downloadFile(toCSV(FACILITY_HEADERS, facilities as any), 'facilities.csv', 'text/csv'),
      onCopy: () => copyToClipboard(toCSV(FACILITY_HEADERS, facilities as any), 'facilities-csv'),
    },
    {
      key: 'facilities-json',
      label: 'Facilities',
      format: 'JSON',
      icon: <FileJson className="w-5 h-5 text-orange" />,
      count: facilities.length,
      onDownload: () => downloadFile(JSON.stringify(facilities, null, 2), 'facilities.json', 'application/json'),
      onCopy: () => copyToClipboard(JSON.stringify(facilities, null, 2), 'facilities-json'),
    },
    {
      key: 'users-csv',
      label: 'Users',
      format: 'CSV',
      icon: <FileText className="w-5 h-5 text-teal" />,
      count: users.length,
      onDownload: () => downloadFile(toCSV(USER_HEADERS, users as any), 'users.csv', 'text/csv'),
      onCopy: () => copyToClipboard(toCSV(USER_HEADERS, users as any), 'users-csv'),
    },
    {
      key: 'users-json',
      label: 'Users',
      format: 'JSON',
      icon: <FileJson className="w-5 h-5 text-orange" />,
      count: users.length,
      onDownload: () => downloadFile(JSON.stringify(users, null, 2), 'users.json', 'application/json'),
      onCopy: () => copyToClipboard(JSON.stringify(users, null, 2), 'users-json'),
    },
  ]

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-white/50 text-sm">Download or copy existing data in CSV or JSON format.</p>
      <div className="grid gap-4">
        {EXPORTS.map(ex => (
          <div key={ex.key} className="bg-charcoal/80 border border-teal/20 rounded-xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {ex.icon}
              <div>
                <p className="font-sora font-semibold text-white text-sm">{ex.label} · {ex.format}</p>
                <p className="text-xs text-white/40">{ex.count} records</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={ex.onCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white/60 hover:text-teal border border-teal/20 rounded-lg transition-colors"
              >
                {copiedKey === ex.key ? <Check className="w-3.5 h-3.5 text-teal" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === ex.key ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={ex.onDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal/10 text-teal border border-teal/30 rounded-lg hover:bg-teal/20 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* JSON paste-ready block */}
      <div className="bg-charcoal/80 border border-teal/20 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-sora font-semibold text-white text-sm">Facilities JSON (paste-ready)</h3>
          <button
            onClick={() => copyToClipboard(JSON.stringify(facilities, null, 2), 'raw-json')}
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-teal transition-colors"
          >
            {copiedKey === 'raw-json' ? <Check className="w-3 h-3 text-teal" /> : <Copy className="w-3 h-3" />}
            {copiedKey === 'raw-json' ? 'Copied' : 'Copy all'}
          </button>
        </div>
        <pre className="text-xs font-mono text-white/50 bg-dark/50 rounded-lg p-3 max-h-48 overflow-auto scrollbar-thin">
          {JSON.stringify(facilities.slice(0, 3), null, 2)}{facilities.length > 3 ? `\n// … ${facilities.length - 3} more` : ''}
        </pre>
      </div>
    </div>
  )
}
