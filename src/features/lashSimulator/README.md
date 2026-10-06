# Simulador de Cílios

Área exclusiva para profissionais com `profiles.professional_type = 'lash'`.

## Como funciona

1. **Foto** — upload (JPG/JPEG/PNG/WEBP, até 15 MB), câmera do celular ou modelo de
   demonstração. A imagem é redimensionada para no máximo 1600 px (`imageUtils.js`).
2. **Análise facial (no aparelho)** — MediaPipe Face Landmarker (`faceAnalysis.js`), 478
   pontos incluindo a íris. Verifica: nenhum rosto, mais de um rosto, rosto distante,
   inclinação (roll/yaw/pitch), olhos fechados (blendshapes + abertura) e iluminação
   (realces e contraste, não a média — para não penalizar peles escuras).
3. **Simulação (no aparelho)** — `lashRenderer.js` desenha cada fio a partir da linha real
   da pálpebra superior. A escala mm → px vem do diâmetro da íris (11,7 mm). Cada fio é
   um modelo 3D simplificado (elevação + curvatura + abertura do leque) projetado na
   foto. Só a região dos cílios é desenhada; o resto da foto não é alterado.
4. **Resultado** — comparação Antes | Depois, download, compartilhamento (celular) e
   histórico.

Nenhuma API externa é usada. Os arquivos do MediaPipe (WASM e `face_landmarker.task`)
são servidos pelo próprio app (`public/lash-simulator/`). A foto só sai do aparelho
quando a profissional toca em **Salvar simulação**.

## Catálogo (`catalog.js`)

Técnica, quantidade de fios (D), curvatura, espessura e mapeamento são listas
independentes. Para adicionar:

- **Técnica**: item em `TECHNIQUES` com `volumes` e `combos` (espessura → D compatíveis).
- **Curvatura**: item em `CURLS` (`curlDeg`, `baseElevation`, `kink`).
- **Espessura**: inclua o valor nos `combos`/`thicknesses` das técnicas compatíveis.
- **Mapeamento**: item em `MAPPINGS` com 9 `offsets` (mm relativos ao comprimento principal).
- **Comprimentos**: `LENGTH_MIN_MM` / `LENGTH_MAX_MM`.

`normalizeSettings()` sempre corrige combinações incompatíveis para o valor válido
mais próximo.

## Modelos de demonstração (`models.js`)

Fotos em `public/lash-simulator/models/` (frontal, olhos abertos, boa luz). Atuais:
Unsplash License. Recomendado trocar por fotos próprias com autorização de imagem.

## Backend (`supabase/sql/lash_simulator.sql`)

- `lash_simulations` — histórico (RLS: dona + perfil lash; delete sempre liberado para a dona).
- `lash_simulator_usage` — contador mensal de simulações salvas.
- `lash_simulator_monthly_limit()` — limite por plano (hoje: 300/mês no plano completo, 0 no demo).
- Trigger de insert: perfil lash, plano completo, pasta própria, limite mensal e anti-rajada (6/min).
- Bucket privado `lash-simulations` (`<user_id>/<simulation_id>/{original,result}.jpg`),
  exibido via URLs assinadas de 30 min.
