'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'
import { navigate } from '@/lib/router'
import { useAuth } from '@/lib/auth-context'
import {
  Infinity as InfinityIcon,
  ShieldCheck,
  Zap,
  Link2,
  BarChart3,
  Users,
  Lock,
  Eye,
  Send,
  CloudUpload,
  FolderOpen,
  Share2,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  History,
  File as FileIcon,
  HardDrive,
} from 'lucide-react'

/* Monochrome feature set — icons carry meaning, one accent max */
const features = [
  {
    icon: InfinityIcon,
    title: 'Unlimited storage',
    desc: "Files live on Telegram's cloud — effectively unlimited space with no servers to maintain and no bills that grow with your data.",
  },
  {
    icon: Zap,
    title: 'Chunked parallel uploads',
    desc: 'Large files are split into 16 MB parts and uploaded in parallel with live progress, speed and resume support.',
  },
  {
    icon: Eye,
    title: 'Instant previews',
    desc: 'Stream images, video, audio and PDFs straight from storage with real byte-range seeking — no full download needed.',
  },
  {
    icon: Link2,
    title: 'Share links',
    desc: 'One-click public links with optional password protection, download counters, expiry and instant revocation.',
  },
  {
    icon: FolderOpen,
    title: 'Folders & organization',
    desc: 'Group files into folders with breadcrumbs, drag & drop uploads, bulk move, stars and search across everything.',
  },
  {
    icon: BarChart3,
    title: 'Admin analytics',
    desc: 'Upload, download and storage trends over 30 days, top consumers, live activity feed and audit logs.',
  },
  {
    icon: Users,
    title: 'Multi-user console',
    desc: 'Open registration with per-user quotas, role-based access (Owner / Admin / User) and full user management.',
  },
  {
    icon: History,
    title: 'Trash & recovery',
    desc: 'Deleted files rest in Trash for 30 days with one-click restore — permanent purge only when you say so.',
  },
]

const steps = [
  { icon: CloudUpload, title: 'Upload', desc: 'Drag & drop any file. It is chunked and stored safely on Telegram.' },
  { icon: FolderOpen, title: 'Organize', desc: 'Sort files into folders with breadcrumbs, search everywhere and bulk moves.' },
  { icon: Share2, title: 'Share', desc: 'Publish a link — with optional password — and track every download.' },
]

const faqs = [
  {
    q: 'Is Telegram storage really safe for my files?',
    a: 'Yes. Telegram distributes data across its global infrastructure with encryption at rest in the cloud. Your files are stored as document parts in a private storage chat that only your bot can access.',
  },
  {
    q: 'How large can a single file be?',
    a: 'Files are split into 16 MB parts and reassembled transparently on download — the practical limit is the per-file cap set by your administrator (2 GB by default). Downloads support byte-range, so video streaming works.',
  },
  {
    q: 'What happens when I delete a file?',
    a: 'It goes to Trash for 30 days and can be restored any time. After 30 days it is purged permanently from Telegram. Share links stop working immediately when a file is trashed.',
  },
  {
    q: 'Can I share files with people who don\'t have an account?',
    a: 'Absolutely — every file can get a public link, optionally protected with a password, plus a scannable QR code and self-destructing direct links. Recipients just open the link and download.',
  },
]

/** Honest architecture strip — how a file actually travels through the system */
function PipelineDiagram() {
  return (
    <div className="rounded-lg border border-border/70 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 h-10 border-b border-border/60">
        <span className="micro-label">Storage pipeline</span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-amber-500" /> LIVE
        </span>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-md border border-border bg-muted/40 grid place-items-center shrink-0">
            <FileIcon className="size-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[12px]">source.file</div>
            <div className="micro-label mt-1">Split into 16 MB parts</div>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">N PARTS</span>
        </div>
        <div className="ml-[18px] h-5 border-l border-dashed border-border" />
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-md border border-primary/40 bg-primary/10 grid place-items-center shrink-0">
            <Send className="size-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[12px]">part_0000 … part_NNNN</div>
            <div className="micro-label mt-1">Parallel upload → storage chat</div>
          </div>
        </div>
        <div className="ml-[18px] h-5 border-l border-dashed border-border" />
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-md border border-border bg-muted/40 grid place-items-center shrink-0">
            <HardDrive className="size-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[12px]">telegram storage chat</div>
            <div className="micro-label mt-1">file_id refs · encrypted at rest</div>
          </div>
        </div>
        <div className="ml-[18px] h-5 border-l border-dashed border-border" />
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-md border border-border bg-muted/40 grid place-items-center shrink-0">
            <ArrowRight className="size-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[12px]">byte-range stream</div>
            <div className="micro-label mt-1">Reassembled on download · seekable</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FaqItem({ q, a, defaultOpen }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className={`rounded-md border transition-colors ${open ? 'border-border bg-card' : 'border-border/60 bg-transparent hover:border-border'}`}>
      <button
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="font-medium text-sm sm:text-[15px]">{q}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function LandingView() {
  const { site } = useAuth()
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <Logo />
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>Sign in</Button>
            <Button size="sm" onClick={() => navigate('/register')}>
              Open console <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-grid-fine border-b border-border/60">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-16 pb-20 grid lg:grid-cols-[1.15fr_1fr] gap-14 items-center">
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1">
                <Send className="size-3 text-primary" />
                <span className="micro-label !text-foreground/70">Powered by Telegram Bot API</span>
              </div>
              <h1 className="text-4xl sm:text-[52px] font-semibold tracking-[-0.02em] leading-[1.06]">
                Private storage,<br />
                <span className="text-primary">zero servers</span> to run.
              </h1>
              <p className="mt-5 text-base text-muted-foreground leading-relaxed max-w-xl">
                {site.siteDescription} ValencyStudio File Manager wraps Telegram&apos;s
                infrastructure in a precise file console — chunked uploads, byte-range
                streaming, protected share links and full admin analytics.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button size="lg" className="gap-2" onClick={() => navigate('/register')}>
                  <CloudUpload className="size-4" /> Start uploading
                </Button>
                <Button size="lg" variant="outline" onClick={() => navigate('/login')}>
                  Sign in
                </Button>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                {['No credit card', 'Unlimited retention', 'Password-protected links'].map(t => (
                  <span key={t} className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-muted-foreground" /> {t}
                  </span>
                ))}
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.12 }}
              className="hidden lg:block"
            >
              <PipelineDiagram />
            </motion.div>
          </div>
        </section>

        {/* Spec band */}
        <section className="border-b border-border/60">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { v: '16 MB', l: 'Chunk size' },
              { v: '2 GB+', l: 'Max file size' },
              { v: '∞', l: 'Storage pool' },
              { v: 'HTTP 206', l: 'Range streaming' },
            ].map(s => (
              <div key={s.l}>
                <div className="font-mono text-2xl font-semibold text-foreground tnum">{s.v}</div>
                <div className="micro-label mt-1.5">{s.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-4 sm:px-6 py-20">
          <div className="max-w-2xl mb-12">
            <div className="micro-label mb-3">Capabilities</div>
            <h2 className="text-3xl font-semibold tracking-tight">Everything a file host needs</h2>
            <p className="mt-3 text-muted-foreground">
              Built like Mediafire & Mega — but the storage engine is Telegram.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border/70 border border-border/70 rounded-lg overflow-hidden">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ delay: (i % 4) * 0.05 }}
                className="bg-card p-6 hover:bg-accent/40 transition-colors"
              >
                <f.icon className="size-5 text-muted-foreground" strokeWidth={1.75} />
                <h3 className="mt-4 font-medium text-[15px]">{f.title}</h3>
                <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-t border-border/60">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20">
            <div className="max-w-2xl mb-12">
              <div className="micro-label mb-3">Workflow</div>
              <h2 className="text-3xl font-semibold tracking-tight">Three steps. That&apos;s it.</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-px bg-border/70 border border-border/70 rounded-lg overflow-hidden">
              {steps.map((s, i) => (
                <motion.div
                  key={s.title}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="relative bg-card p-6"
                >
                  <span className="absolute top-5 right-6 font-mono text-[11px] text-muted-foreground/60">
                    0{i + 1}
                  </span>
                  <s.icon className="size-6 text-foreground" strokeWidth={1.75} />
                  <h3 className="mt-4 font-medium text-[15px]">{s.title}</h3>
                  <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">{s.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-border/60">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 py-20">
            <div className="mb-10">
              <div className="micro-label mb-3">FAQ</div>
              <h2 className="text-3xl font-semibold tracking-tight">Frequently asked questions</h2>
            </div>
            <div className="space-y-3">
              {faqs.map((f, i) => (
                <FaqItem key={i} q={f.q} a={f.a} defaultOpen={i === 0} />
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border/60">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20 text-center">
            <ShieldCheck className="mx-auto size-8 text-muted-foreground" strokeWidth={1.5} />
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">Ready to store without limits?</h2>
            <p className="mt-3 text-muted-foreground max-w-md mx-auto">
              Create an account and upload your first file in under a minute.
            </p>
            <Button size="lg" className="mt-7 gap-2" onClick={() => navigate('/register')}>
              Create account <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t border-border/60 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <Logo size={26} textClass="opacity-90" />
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <Lock className="size-3.5" /> Files stored via Telegram Bot API · {new Date().getFullYear()}
          </div>
        </div>
      </footer>
    </div>
  )
}
