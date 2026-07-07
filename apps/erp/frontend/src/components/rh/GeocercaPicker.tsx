import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L, { LatLngExpression, Map as LeafletMap } from 'leaflet';
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { toast } from '../../utils/toast';
import { Field } from './rhUi';

export const GEOCERCA_RAIO_PADRAO = 150;
export const GEOCERCA_RAIO_MIN = 10;
export const GEOCERCA_RAIO_MAX = 10_000;

const FALLBACK_CENTER: LatLngExpression = [-15.7801, -47.9292]; // ~centro do Brasil
const FALLBACK_ZOOM = 4;
const ZOOM_PONTO = 17;

// Sem essa configuração os ícones do Leaflet quebram no Vite.
L.Marker.prototype.options.icon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export interface GeocercaValor {
  ativo: boolean;
  latitude: string; // mantido como string para permitir edição parcial
  longitude: string;
  raio: string;
}

export function geocercaInicialDe(payload: {
  latitudeReferencia: number | null | undefined;
  longitudeReferencia: number | null | undefined;
  raioMetros: number | null | undefined;
}): GeocercaValor {
  const ativa =
    payload.latitudeReferencia != null &&
    payload.longitudeReferencia != null &&
    payload.raioMetros != null;
  return {
    ativo: ativa,
    latitude: payload.latitudeReferencia != null ? String(payload.latitudeReferencia) : '',
    longitude: payload.longitudeReferencia != null ? String(payload.longitudeReferencia) : '',
    raio: payload.raioMetros != null ? String(payload.raioMetros) : String(GEOCERCA_RAIO_PADRAO),
  };
}

/**
 * Converte o estado da UI em payload pronto para o backend (com null quando
 * a geocerca está desativada). Retorna `motivo` quando a configuração é
 * inválida (e não houve flag para desativar).
 */
export function montarPayloadGeocerca(
  v: GeocercaValor,
):
  | { ok: true; payload: { latitudeReferencia: number | null; longitudeReferencia: number | null; raioMetros: number | null } }
  | { ok: false; motivo: string } {
  if (!v.ativo) {
    return {
      ok: true,
      payload: { latitudeReferencia: null, longitudeReferencia: null, raioMetros: null },
    };
  }
  const lat = Number.parseFloat(v.latitude);
  const lon = Number.parseFloat(v.longitude);
  const r = Number.parseInt(v.raio, 10);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { ok: false, motivo: 'Latitude inválida (precisa estar entre -90 e 90).' };
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return { ok: false, motivo: 'Longitude inválida (precisa estar entre -180 e 180).' };
  }
  if (!Number.isFinite(r) || r < GEOCERCA_RAIO_MIN || r > GEOCERCA_RAIO_MAX) {
    return {
      ok: false,
      motivo: `Raio precisa estar entre ${GEOCERCA_RAIO_MIN} e ${GEOCERCA_RAIO_MAX} metros.`,
    };
  }
  return { ok: true, payload: { latitudeReferencia: lat, longitudeReferencia: lon, raioMetros: r } };
}

// ─── Busca por CEP (ViaCEP) + geocodificação (Nominatim/OSM) ────────────────

interface ViaCepResposta {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

interface EnderecoResolvido {
  cepFormatado: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  resumo: string;
  latitude: number;
  longitude: number;
}

/**
 * Resolve um CEP brasileiro em coordenadas:
 *   1. ViaCEP devolve rua/bairro/cidade/UF.
 *   2. Nominatim (OpenStreetMap) geocodifica o endereço resultante.
 * Os dois serviços são gratuitos e não exigem chave; uso esporádico cabe
 * tranquilamente no rate-limit (1 req/s no Nominatim).
 */
async function buscarCoordenadasPorCep(cepBruto: string): Promise<EnderecoResolvido> {
  const cep = cepBruto.replace(/\D/g, '');
  if (cep.length !== 8) {
    throw new Error('CEP inválido. Use 8 dígitos (ex.: 01310-100).');
  }
  const cepFormatado = `${cep.slice(0, 5)}-${cep.slice(5)}`;

  const respCep = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  if (!respCep.ok) {
    throw new Error('Não foi possível consultar o ViaCEP. Tente novamente.');
  }
  const dadosCep = (await respCep.json()) as ViaCepResposta;
  if (dadosCep.erro || !dadosCep.localidade || !dadosCep.uf) {
    throw new Error(`CEP ${cepFormatado} não encontrado.`);
  }

  // Monta o endereço priorizando os campos mais específicos.
  const partes = [
    dadosCep.logradouro?.trim(),
    dadosCep.bairro?.trim(),
    dadosCep.localidade.trim(),
    dadosCep.uf.trim(),
    'Brasil',
  ].filter(Boolean) as string[];
  const queryEndereco = partes.join(', ');
  const queryFallback = [dadosCep.localidade.trim(), dadosCep.uf.trim(), 'Brasil'].join(', ');

  /**
   * Geocodificação no Nominatim. Aceita dois modos exclusivos:
   *   - `q` (busca livre por string)
   *   - parâmetros estruturados (`postalcode`/`city`/`country`)
   * Misturar os dois retorna 400.
   */
  async function geocodificar(modo: { tipo: 'free'; q: string } | { tipo: 'structured' }) {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('addressdetails', '1');
    if (modo.tipo === 'free') {
      url.searchParams.set('countrycodes', 'br');
      url.searchParams.set('q', modo.q);
    } else {
      url.searchParams.set('country', 'Brasil');
      url.searchParams.set('postalcode', cep);
      if (dadosCep.localidade) url.searchParams.set('city', dadosCep.localidade.trim());
      if (dadosCep.uf) url.searchParams.set('state', dadosCep.uf.trim());
    }
    const r = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('Falha ao geocodificar o endereço (Nominatim).');
    return (await r.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  }

  // 1º tenta endereço completo (busca livre).
  let resultados = await geocodificar({ tipo: 'free', q: queryEndereco });
  // 2º tenta busca estruturada usando o próprio CEP.
  if (resultados.length === 0) {
    resultados = await geocodificar({ tipo: 'structured' });
  }
  // 3º cai pra cidade/UF (sempre acha algo).
  if (resultados.length === 0 && queryEndereco !== queryFallback) {
    resultados = await geocodificar({ tipo: 'free', q: queryFallback });
  }
  if (resultados.length === 0) {
    throw new Error(
      `Não foi possível localizar coordenadas para o CEP ${cepFormatado}. Refine clicando no mapa.`,
    );
  }

  const lat = Number.parseFloat(resultados[0].lat);
  const lon = Number.parseFloat(resultados[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('Coordenadas inválidas retornadas pelo serviço de mapas.');
  }

  return {
    cepFormatado,
    logradouro: dadosCep.logradouro?.trim() ?? '',
    bairro: dadosCep.bairro?.trim() ?? '',
    cidade: dadosCep.localidade.trim(),
    uf: dadosCep.uf.trim(),
    resumo: queryEndereco.replace(', Brasil', ''),
    latitude: lat,
    longitude: lon,
  };
}

function obterPosicaoAtual(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Seu navegador não suporta geolocalização.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error('Permissão de localização negada. Habilite o GPS / autorize o navegador.'));
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reject(new Error('Localização indisponível. Verifique se o GPS está ligado.'));
        } else if (err.code === err.TIMEOUT) {
          reject(new Error('Tempo esgotado ao obter a localização.'));
        } else {
          reject(new Error(`Falha ao obter localização: ${err.message}`));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

function MapClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapFlyTo({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (lat == null || lng == null) return;
    map.flyTo([lat, lng], Math.max(map.getZoom(), ZOOM_PONTO), { duration: 0.7 });
  }, [lat, lng, map]);
  return null;
}

interface GeocercaPickerProps {
  value: GeocercaValor;
  onChange: (next: GeocercaValor) => void;
  /** Quando true, esconde o checkbox e força o picker como ativo (usado pelo TabGeocerca). */
  hideToggle?: boolean;
  /** Texto do checkbox; quando ausente, usa um padrão. */
  toggleLabel?: string;
  /** Altura do mapa em CSS (ex.: 'h-72'). */
  mapHeight?: string;
}

/**
 * Picker reutilizável de geocerca: mapa interativo (Leaflet/OpenStreetMap),
 * inputs de lat/long/raio sincronizados, botão "usar minha localização" e
 * círculo do raio. Usado tanto na configuração da UNIDADE (TabGeocerca)
 * quanto na configuração da JORNADA individual do colaborador (TabJornada).
 */
export function GeocercaPicker({
  value,
  onChange,
  hideToggle = false,
  toggleLabel,
  mapHeight = 'h-72',
}: GeocercaPickerProps) {
  const { ativo, latitude, longitude, raio } = value;

  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const ativoRef = useRef(ativo);
  useEffect(() => {
    ativoRef.current = ativo;
  }, [ativo]);

  // Busca por CEP -- estado isolado (não persiste; só ajuda a popular lat/long).
  const [cep, setCep] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepInfo, setCepInfo] = useState<{ resumo: string; cep: string } | null>(null);

  // Centraliza o mapa quando o valor inicial chega (após carregar do backend).
  useEffect(() => {
    const lat = Number.parseFloat(latitude);
    const lng = Number.parseFloat(longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && !flyTarget) {
      setFlyTarget({ lat, lng });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(part: Partial<GeocercaValor>) {
    onChange({ ...value, ...part });
  }

  async function buscarPorCep() {
    const limpo = cep.replace(/\D/g, '');
    if (limpo.length !== 8) {
      toast.error('Digite um CEP válido (8 dígitos).');
      return;
    }
    setCepLoading(true);
    try {
      const result = await buscarCoordenadasPorCep(limpo);
      patch({
        ativo: true,
        latitude: String(result.latitude),
        longitude: String(result.longitude),
      });
      setFlyTarget({ lat: result.latitude, lng: result.longitude });
      setCepInfo({ resumo: result.resumo, cep: result.cepFormatado });
      toast.success(`CEP localizado: ${result.resumo}. Ajuste o ponto exato no mapa, se necessário.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao consultar o CEP.';
      toast.error(msg);
      setCepInfo(null);
    } finally {
      setCepLoading(false);
    }
  }

  /** Formata enquanto digita: 12345-678 */
  function formatarCepInput(s: string) {
    const d = s.replace(/\D/g, '').slice(0, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  }

  async function usarMinhaLocalizacao() {
    try {
      const pos = await obterPosicaoAtual();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      patch({ ativo: true, latitude: String(lat), longitude: String(lng) });
      setFlyTarget({ lat, lng });
      toast.success(
        `Localização capturada (precisão: ±${Math.round(pos.coords.accuracy)} m). Confira no mapa antes de salvar.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível capturar a localização.');
    }
  }

  const onPickFromMap = useCallback(
    (lat: number, lng: number) => {
      const next: GeocercaValor = {
        ativo: ativoRef.current ? true : true,
        latitude: lat.toFixed(6),
        longitude: lng.toFixed(6),
        raio,
      };
      onChange(next);
    },
    [onChange, raio],
  );

  function onLatitudeChange(s: string) {
    patch({ latitude: s });
    const lat = Number.parseFloat(s);
    const lng = Number.parseFloat(longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) setFlyTarget({ lat, lng });
  }

  function onLongitudeChange(s: string) {
    patch({ longitude: s });
    const lat = Number.parseFloat(latitude);
    const lng = Number.parseFloat(s);
    if (Number.isFinite(lat) && Number.isFinite(lng)) setFlyTarget({ lat, lng });
  }

  const latNum = Number.parseFloat(latitude);
  const lngNum = Number.parseFloat(longitude);
  const raioNum = Number.parseInt(raio, 10);
  const coordsValidas =
    Number.isFinite(latNum) &&
    Number.isFinite(lngNum) &&
    latNum >= -90 &&
    latNum <= 90 &&
    lngNum >= -180 &&
    lngNum <= 180;
  const raioValido = Number.isFinite(raioNum) && raioNum >= GEOCERCA_RAIO_MIN && raioNum <= GEOCERCA_RAIO_MAX;

  const linkMapa = useMemo(() => {
    if (!coordsValidas) return null;
    return `https://www.google.com/maps?q=${latNum},${lngNum}&z=18`;
  }, [coordsValidas, latNum, lngNum]);

  return (
    <div className="space-y-3">
      {!hideToggle ? (
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => patch({ ativo: e.target.checked })}
          />
          <span>{toggleLabel ?? 'Geocerca ativa — bloquear batida fora do raio definido'}</span>
        </label>
      ) : null}

      {/* Busca por CEP -- ajuda a achar o local sem precisar abrir outro mapa.
          Funciona mesmo com a geocerca desativada (ativa automaticamente ao
          encontrar um endereço). */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <Field label="Buscar por CEP">
              <input
                type="text"
                inputMode="numeric"
                value={cep}
                onChange={(e) => setCep(formatarCepInput(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void buscarPorCep();
                  }
                }}
                placeholder="00000-000"
                className="w-full bg-neutral border border-white/15 rounded px-2 py-1.5 text-sm tabular-nums"
              />
            </Field>
          </div>
          <button
            type="button"
            onClick={() => void buscarPorCep()}
            disabled={cepLoading || cep.replace(/\D/g, '').length !== 8}
            className="rounded-md border border-primary/40 bg-primary/15 hover:bg-primary/25 text-sm px-3 py-1.5 text-white disabled:opacity-50"
          >
            {cepLoading ? 'Buscando…' : '🔍 Localizar'}
          </button>
        </div>
        {cepInfo ? (
          <p className="text-xs text-emerald-300/85 mt-2">
            ✓ {cepInfo.cep} — {cepInfo.resumo}. Confirme o ponto exato no mapa abaixo.
          </p>
        ) : (
          <p className="text-xs text-white/45 mt-2">
            Digita o CEP do local de trabalho e clique em Localizar — usamos ViaCEP + OpenStreetMap
            para preencher latitude e longitude automaticamente. Você ainda pode ajustar clicando ou
            arrastando o marcador.
          </p>
        )}
      </div>

      <div
        className={`grid grid-cols-1 md:grid-cols-3 gap-3 ${
          ativo ? '' : 'opacity-50 pointer-events-none'
        }`}
      >
        <Field label="Latitude (-90 a 90)">
          <input
            type="number"
            step="any"
            value={latitude}
            onChange={(e) => onLatitudeChange(e.target.value)}
            placeholder="-23.55052"
            className="w-full bg-neutral border border-white/15 rounded px-2 py-1.5 text-sm tabular-nums"
          />
        </Field>
        <Field label="Longitude (-180 a 180)">
          <input
            type="number"
            step="any"
            value={longitude}
            onChange={(e) => onLongitudeChange(e.target.value)}
            placeholder="-46.633308"
            className="w-full bg-neutral border border-white/15 rounded px-2 py-1.5 text-sm tabular-nums"
          />
        </Field>
        <Field label={`Raio em metros (${GEOCERCA_RAIO_MIN}–${GEOCERCA_RAIO_MAX})`}>
          <input
            type="number"
            min={GEOCERCA_RAIO_MIN}
            max={GEOCERCA_RAIO_MAX}
            step={10}
            value={raio}
            onChange={(e) => patch({ raio: e.target.value })}
            className="w-full bg-neutral border border-white/15 rounded px-2 py-1.5 text-sm tabular-nums"
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void usarMinhaLocalizacao()}
          disabled={!ativo}
          className="rounded-md border border-primary/40 bg-primary/15 hover:bg-primary/25 text-sm px-3 py-1.5 text-white disabled:opacity-50"
        >
          📍 Usar minha localização atual
        </button>
        {linkMapa ? (
          <a
            href={linkMapa}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-white/15 bg-white/5 hover:bg-white/10 text-sm px-3 py-1.5 text-white/85"
          >
            Abrir no Google Maps
          </a>
        ) : null}
      </div>

      {ativo ? (
        <div className="rounded-lg overflow-hidden border border-white/10">
          <div className="px-3 py-2 bg-black/20 text-xs text-white/65">
            <strong>Clique</strong> no mapa para escolher o local, ou <strong>arraste o marcador</strong>.
            {coordsValidas
              ? ` Posição atual: ${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`
              : ' Nenhuma posição definida ainda.'}
          </div>
          <MapContainer
            center={coordsValidas ? [latNum, lngNum] : FALLBACK_CENTER}
            zoom={coordsValidas ? ZOOM_PONTO : FALLBACK_ZOOM}
            scrollWheelZoom
            className={`w-full ${mapHeight}`}
            ref={(instance) => {
              mapRef.current = instance;
            }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickHandler onPick={onPickFromMap} />
            <MapFlyTo lat={flyTarget?.lat ?? null} lng={flyTarget?.lng ?? null} />
            {coordsValidas ? (
              <>
                <Marker
                  position={[latNum, lngNum]}
                  draggable
                  eventHandlers={{
                    dragend: (e) => {
                      const m = e.target as L.Marker;
                      const { lat, lng } = m.getLatLng();
                      onPickFromMap(lat, lng);
                    },
                  }}
                />
                {raioValido ? (
                  <Circle
                    center={[latNum, lngNum]}
                    radius={raioNum}
                    pathOptions={{
                      color: '#38bdf8',
                      fillColor: '#38bdf8',
                      fillOpacity: 0.15,
                      weight: 2,
                    }}
                  />
                ) : null}
              </>
            ) : null}
          </MapContainer>
          <p className="text-xs text-white/50 px-3 py-2 bg-black/20">
            Pré-visualização (OpenStreetMap). O círculo azul mostra o raio configurado
            ({raioValido ? `${raioNum} m` : '—'}); na batida, o backend valida a distância
            via fórmula de Haversine.
          </p>
        </div>
      ) : null}
    </div>
  );
}
