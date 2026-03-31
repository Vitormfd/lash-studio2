# Lash Studio — Gestão Profissional

Sistema de agendamento e faturamento para lash designers.  
Migrado de HTML único para **React + Vite**, mantendo 100% da lógica e visual original.

---

## 🚀 Como rodar

### 1. Instalar dependências
```bash
npm install
```

### 2. Rodar em desenvolvimento
```bash
npm run dev
```

### 3. Gerar build de produção
```bash
npm run build
```

### 4. Visualizar build
```bash
npm run preview
```

---

## 📁 Estrutura do projeto

```
lash-studio/
├── index.html                  # Entry point HTML + PWA scripts
├── vite.config.js              # Config do Vite
├── package.json
├── public/
│   ├── manifest.json           # PWA manifest
│   ├── service-worker.js       # Service Worker (cache offline)
│   ├── icon-192.png
│   └── icon-512.png
└── src/
    ├── main.jsx                # Monta o React na DOM
    ├── App.jsx                 # Raiz: autenticação + AppMain
    ├── styles/
    │   └── global.css          # Variáveis CSS, reset, animações
    ├── lib/
    │   ├── supabase.js         # Cliente Supabase + DB layer (CRUD)
    │   ├── auth.js             # Login, registro, sessão
    │   └── utils.js            # Helpers de data/hora, cores, constantes
    ├── hooks/
    │   └── useToast.js         # Hook de notificações (toast)
    ├── components/
    │   ├── Icon.jsx            # Todos os ícones SVG inline
    │   ├── UI.jsx              # Btn, Field, Inp, Sel, Textarea, StatCard, Spinner
    │   ├── Modal.jsx           # Modal genérico
    │   ├── Toast.jsx           # Notificações flutuantes
    │   ├── Sidebar.jsx         # Menu lateral
    │   ├── Topbar.jsx          # Barra de topo
    │   └── AppointmentForm.jsx # Formulário de agendamento
    └── pages/
        ├── AuthScreen.jsx      # Tela de login/cadastro
        ├── Dashboard.jsx       # Resumo do dia/semana/mês
        ├── Agenda.jsx          # Calendário (dia/semana/mês)
        ├── Clients.jsx         # Gestão de clientes
        ├── Services.jsx        # Gestão de serviços
        ├── Finance.jsx         # Financeiro por mês
        ├── Reports.jsx         # Relatórios por período
        └── Settings.jsx        # Configurações + conta
```

---

## ☁️ Supabase

As credenciais já estão configuradas em `src/lib/supabase.js`:

```js
const SUPABASE_URL = 'https://mbxfswxjrdikdyzpukmw.supabase.co'
const SUPABASE_KEY = 'sb_publishable_...'
```

Para trocar de projeto Supabase, edite essas duas constantes.

### SQL para criar as tabelas (cole no Supabase → SQL Editor):

```sql
create table clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  name text not null, phone text, notes text,
  created_at timestamptz default now()
);
create table services (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  name text not null, price decimal(10,2) not null,
  color text
);
create table appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  client_id uuid references clients(id) on delete set null,
  service_id uuid references services(id) on delete set null,
  date date not null, time time not null,
  value decimal(10,2), notes text,
  status text default 'confirmed',
  blocked boolean default false,
  duration_minutes int default 60,
  created_at timestamptz default now()
);
create table config (
  user_id uuid primary key references auth.users on delete cascade,
  avg_cost decimal(10,2) default 12.35
);
alter table clients enable row level security;
alter table services enable row level security;
alter table appointments enable row level security;
alter table config enable row level security;
create policy "own" on clients for all using (auth.uid()=user_id);
create policy "own" on services for all using (auth.uid()=user_id);
create policy "own" on appointments for all using (auth.uid()=user_id);
create policy "own" on config for all using (auth.uid()=user_id);
```

---

## 📱 PWA

O app pode ser instalado como PWA no celular. O Service Worker e manifest já estão configurados na pasta `public/`.

---

## 🧩 O que mudou vs. o HTML original

| Antes | Depois |
|---|---|
| 1 arquivo `index.html` com 2.100+ linhas | 20+ arquivos organizados por responsabilidade |
| React + Babel carregados via CDN | React + Vite (build otimizado, HMR) |
| Todo JS inline no `<script type="text/babel">` | Módulos ES com imports/exports |
| CSS inline em cada componente | `global.css` com variáveis CSS centralizadas |
| Supabase carregado via CDN | `@supabase/supabase-js` via npm |

**Tudo que NÃO mudou:** lógica de negócio, visual, cores, animações, estrutura de dados, conexão Supabase, suporte a PWA/offline.
