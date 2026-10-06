import {
  CURLS,
  CUSTOM_MAPPING_ID,
  LENGTH_OPTIONS_MM,
  MAPPINGS,
  TECHNIQUES,
  TEXTURES,
  buildMappingLengths,
  formatThickness,
  formatVolume,
  getClassicThicknessOptions,
  getCurl,
  getMapping,
  getTechnique,
  getThicknessOptions,
  getVolumeOptions,
  normalizeSettings,
} from '../catalog'
import MappingEditor from './MappingEditor'
import { CurlGlyph, MappingSparkline } from './SimIcons'

const Section = ({ title, aside, children }) => (
  <section className="ls-section">
    <div className="ls-section-title">
      <span>{title}</span>
      {aside}
    </div>
    {children}
  </section>
)

const Chip = ({ selected, onClick, children, label, disabled }) => (
  <button
    type="button"
    className="ls-chip"
    aria-pressed={selected}
    aria-label={label}
    onClick={onClick}
    disabled={disabled}
  >
    {children}
  </button>
)

/**
 * Configuração da extensão. Cada categoria é independente; as opções de D e
 * espessura são filtradas pela técnica para nunca formar combinações incoerentes.
 */
const ConfigPanel = ({ settings, onChange }) => {
  const technique = getTechnique(settings.technique)
  const volumeOptions = getVolumeOptions(technique.id)
  const thicknessOptions = getThicknessOptions(technique.id, settings.volume)
  const classicOptions = getClassicThicknessOptions(technique.id)
  const mapping = getMapping(settings.mapping)
  const isCustom = mapping.id === CUSTOM_MAPPING_ID

  const update = (patch) => onChange(normalizeSettings({ ...settings, ...patch }))

  const selectTechnique = (id) => {
    const next = getTechnique(id)
    update({
      technique: id,
      volume: next.defaults.volume ?? null,
      thicknessMm: next.defaults.thicknessMm,
      classicThicknessMm: next.defaults.classicThicknessMm ?? null,
    })
  }

  const selectMapping = (id) => {
    if (id === CUSTOM_MAPPING_ID) {
      // Começa do desenho atual para a profissional só ajustar.
      update({ mapping: id, lengths: settings.lengths, texture: settings.texture })
    } else {
      update({ mapping: id })
    }
  }

  const peakMm = isCustom ? Math.max(...settings.lengths) : settings.peakMm

  const selectPeak = (mm) => {
    if (!isCustom) {
      update({ peakMm: mm })
      return
    }
    const delta = mm - peakMm
    update({ lengths: settings.lengths.map((value) => value + delta), texture: settings.texture })
  }

  // Editar uma região transforma o mapeamento em Personalizado, mantendo os valores.
  const editLengths = (lengths) => update({ mapping: CUSTOM_MAPPING_ID, lengths, texture: settings.texture })

  return (
    <div style={{ marginTop: 16 }}>
      <Section title="Técnica / Modelo">
        <div className="ls-option-grid">
          {TECHNIQUES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="ls-option"
              aria-pressed={item.id === technique.id}
              onClick={() => selectTechnique(item.id)}
            >
              <strong>{item.label}</strong>
              <span>
                {item.volumes
                  ? item.volumes.length === 1
                    ? formatVolume(item.volumes[0])
                    : `${formatVolume(item.volumes[0])} a ${formatVolume(item.volumes[item.volumes.length - 1])}`
                  : '1 fio por fio natural'}
              </span>
            </button>
          ))}
        </div>
        <p className="ls-selected-desc">{technique.description}</p>
      </Section>

      {volumeOptions.length > 0 && (
        <Section title="Quantidade de fios (D)">
          <div className="ls-chips" role="group" aria-label="Quantidade de fios">
            {volumeOptions.map((d) => (
              <Chip key={d} selected={settings.volume === d} onClick={() => update({ volume: d })}>
                {formatVolume(d)}
              </Chip>
            ))}
          </div>
          {volumeOptions.length === 1 && (
            <p className="ls-hint">O fio do {technique.label} tem formato fixo de {formatVolume(volumeOptions[0])}.</p>
          )}
        </Section>
      )}

      <Section title="Curvatura">
        <div className="ls-chips" role="group" aria-label="Curvatura">
          {CURLS.map((curl) => (
            <Chip
              key={curl.id}
              selected={settings.curl === curl.id}
              onClick={() => update({ curl: curl.id })}
              label={`Curvatura ${curl.label}`}
            >
              <CurlGlyph curlId={curl.id} size={20} />
              {curl.label}
            </Chip>
          ))}
        </div>
        <p className="ls-hint">{getCurl(settings.curl).description}</p>
      </Section>

      <Section title={classicOptions.length ? 'Espessura dos leques' : 'Espessura'}>
        <div className="ls-chips" role="group" aria-label="Espessura">
          {thicknessOptions.map((mm) => (
            <Chip key={mm} selected={settings.thicknessMm === mm} onClick={() => update({ thicknessMm: mm })}>
              {formatThickness(mm)}
            </Chip>
          ))}
        </div>
        <p className="ls-hint">
          {settings.volume
            ? `Espessuras compatíveis com ${technique.label} em ${formatVolume(settings.volume)}.`
            : `Espessuras indicadas para ${technique.label}.`}
        </p>
      </Section>

      {classicOptions.length > 0 && (
        <Section title="Espessura dos fios fio a fio">
          <div className="ls-chips" role="group" aria-label="Espessura do fio a fio">
            {classicOptions.map((mm) => (
              <Chip key={mm} selected={settings.classicThicknessMm === mm} onClick={() => update({ classicThicknessMm: mm })}>
                {formatThickness(mm)}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      <Section title="Mapeamento">
        <div className="ls-option-grid">
          {MAPPINGS.map((item) => {
            const preview = item.offsets ? buildMappingLengths(item.id, settings.peakMm) : settings.lengths
            return (
              <button
                key={item.id}
                type="button"
                className="ls-option"
                aria-pressed={item.id === mapping.id}
                onClick={() => selectMapping(item.id)}
              >
                <span className="ls-option-head">
                  <strong>{item.label}</strong>
                  <span style={{ color: item.id === mapping.id ? 'var(--rose-deep)' : 'var(--rose)' }}>
                    <MappingSparkline lengths={preview} width={46} height={18} />
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        <p className="ls-selected-desc">{mapping.description}</p>
      </Section>

      <Section title="Comprimento principal" aside={<span style={{ textTransform: 'none', letterSpacing: 0 }}>{peakMm} mm</span>}>
        <div className="ls-chips" role="group" aria-label="Comprimento principal">
          {LENGTH_OPTIONS_MM.map((mm) => (
            <Chip key={mm} selected={peakMm === mm} onClick={() => selectPeak(mm)} label={`${mm} milímetros`}>
              {mm}
            </Chip>
          ))}
        </div>
        <p className="ls-hint">
          {isCustom
            ? 'Maior comprimento do seu mapeamento. Trocar aqui sobe ou desce todas as regiões juntas.'
            : 'Maior comprimento do mapeamento. As demais regiões acompanham o desenho escolhido.'}
        </p>
      </Section>

      <Section title={isCustom ? 'Comprimentos por região' : 'Comprimentos do mapeamento'}>
        <MappingEditor lengths={settings.lengths} onChange={editLengths} />
        {isCustom && (
          <>
            <div className="ls-section-title" style={{ marginTop: 14 }}><span>Textura</span></div>
            <div className="ls-chips" role="group" aria-label="Textura">
              {Object.values(TEXTURES).map((texture) => (
                <Chip key={texture.id} selected={settings.texture === texture.id} onClick={() => update({ texture: texture.id })}>
                  {texture.label}
                </Chip>
              ))}
            </div>
          </>
        )}
        {!isCustom && <p className="ls-hint">Ajuste qualquer região para criar um mapeamento personalizado.</p>}
      </Section>
    </div>
  )
}

export default ConfigPanel
