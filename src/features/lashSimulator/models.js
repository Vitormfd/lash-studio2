// Biblioteca de modelos para demonstração.
//
// Para adicionar uma modelo: coloque a foto (frontal, olhos abertos, boa luz, sem
// óculos/franja sobre os olhos) e uma miniatura em public/lash-simulator/models/ e
// acrescente um item abaixo. Use somente fotos com licença de uso comercial ou
// autorização de imagem, e registre a origem em `credit`.
//
// Fotos atuais: Unsplash (https://unsplash.com/license) — uso comercial gratuito,
// sem necessidade de atribuição. Recomendado substituir por fotos próprias com
// termo de autorização de imagem antes de campanhas de marketing.

const BASE = '/lash-simulator/models'

export const DEMO_MODELS = [
  {
    id: 'modelo-01',
    name: 'Modelo 1',
    eyeShape: 'Amendoados, cílios claros',
    src: `${BASE}/modelo-01.jpg`,
    thumb: `${BASE}/modelo-01-thumb.jpg`,
    credit: { author: 'Gus Tu Njana', source: 'https://unsplash.com/photos/BOW0zIGpUGI', license: 'Unsplash License' },
  },
  {
    id: 'modelo-02',
    name: 'Modelo 2',
    eyeShape: 'Pálpebra com pouca dobra aparente',
    src: `${BASE}/modelo-02.jpg`,
    thumb: `${BASE}/modelo-02-thumb.jpg`,
    credit: { author: 'Peter John Manlapig', source: 'https://unsplash.com/photos/KRBHTbLTMDs', license: 'Unsplash License' },
  },
  {
    id: 'modelo-03',
    name: 'Modelo 3',
    eyeShape: 'Grandes, com delineado',
    src: `${BASE}/modelo-03.jpg`,
    thumb: `${BASE}/modelo-03-thumb.jpg`,
    credit: { author: 'Vlad Rudkov', source: 'https://unsplash.com/photos/Q_ZIfj3Ahro', license: 'Unsplash License' },
  },
  {
    id: 'modelo-04',
    name: 'Modelo 4',
    eyeShape: 'Arredondados',
    src: `${BASE}/modelo-04.jpg`,
    thumb: `${BASE}/modelo-04-thumb.jpg`,
    credit: { author: 'Hassan Khan', source: 'https://unsplash.com/photos/EGVccebWodM', license: 'Unsplash License' },
  },
  {
    id: 'modelo-05',
    name: 'Modelo 5',
    eyeShape: 'Amendoados alongados',
    src: `${BASE}/modelo-05.jpg`,
    thumb: `${BASE}/modelo-05-thumb.jpg`,
    credit: { author: 'Gideon Hezekiah', source: 'https://unsplash.com/photos/FYxhALJcywI', license: 'Unsplash License' },
  },
  {
    id: 'modelo-06',
    name: 'Modelo 6',
    eyeShape: 'Amendoados profundos',
    src: `${BASE}/modelo-06.jpg`,
    thumb: `${BASE}/modelo-06-thumb.jpg`,
    credit: { author: 'see plus', source: 'https://unsplash.com/photos/cC2TKDf21jY', license: 'Unsplash License' },
  },
]

export const getDemoModel = (id) => DEMO_MODELS.find((model) => model.id === id) || null
