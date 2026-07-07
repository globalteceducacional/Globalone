# -*- coding: utf-8 -*-
"""Reprodução de áudio WAV no cliente Teca-Chat.

Suporta dois modos de uso:

1) Streaming intercalado (modo `responda` novo) — usa `AudioQueuePlayer`
   para receber WAVs via .play(bytes) e reproduzi-los em background, sem
   bloquear a thread que está consumindo o stream de texto.

2) Legado: `solicitar_audio(conn)` continua disponível para clientes
   antigos que recebem o áudio em bloco no final do stream.

Protocolo de framing (modo legado):
  [10 bytes ASCII com o tamanho do segmento][bytes do WAV] ...
  Header "0000000000" (size = 0) sinaliza fim do stream.
"""
import io
import queue
import socket
import threading
import wave
from typing import Optional

import pyaudio

HEADER_LEN = 10
PLAYBACK_FRAMES = 4096


def _recv_exact(conn: socket.socket, n: int) -> bytes:
    buf = bytearray()
    while len(buf) < n:
        chunk = conn.recv(n - len(buf))
        if not chunk:
            break
        buf.extend(chunk)
    return bytes(buf)


def _play_wav_bytes(p: pyaudio.PyAudio, data: bytes) -> None:
    with wave.open(io.BytesIO(data), "rb") as wf:
        stream = p.open(
            format=p.get_format_from_width(wf.getsampwidth()),
            channels=wf.getnchannels(),
            rate=wf.getframerate(),
            output=True,
        )
        try:
            frames = wf.readframes(PLAYBACK_FRAMES)
            while frames:
                stream.write(frames)
                frames = wf.readframes(PLAYBACK_FRAMES)
        finally:
            stream.stop_stream()
            stream.close()


class AudioQueuePlayer:
    """Toca segmentos WAV em background na ordem de chegada.

    Permite que o cliente continue lendo chunks de texto do socket enquanto
    o áudio do segmento anterior ainda está tocando.
    """

    _SENTINEL = object()

    def __init__(self) -> None:
        self._q: "queue.Queue" = queue.Queue()
        self._p: Optional[pyaudio.PyAudio] = None
        self._th = threading.Thread(target=self._run, daemon=True)
        self._th.start()

    def play(self, wav_bytes: bytes) -> None:
        if wav_bytes:
            self._q.put(wav_bytes)

    def close(self, timeout: float = 30.0) -> None:
        """Sinaliza fim e bloqueia até a fila esvaziar."""
        self._q.put(self._SENTINEL)
        self._th.join(timeout=timeout)

    def _run(self) -> None:
        try:
            while True:
                item = self._q.get()
                if item is self._SENTINEL:
                    break
                if self._p is None:
                    self._p = pyaudio.PyAudio()
                try:
                    _play_wav_bytes(self._p, item)
                except Exception as e:
                    print(f"[AudioQueuePlayer] erro: {e}")
        finally:
            if self._p is not None:
                self._p.terminate()


def solicitar_audio(conn: socket.socket) -> None:
    """Modo legado: recebe segmentos WAV até o sentinel e reproduz em série."""
    p: Optional[pyaudio.PyAudio] = None
    try:
        while True:
            header = _recv_exact(conn, HEADER_LEN)
            if len(header) < HEADER_LEN:
                break
            try:
                seg_len = int(header.decode("ascii"))
            except ValueError:
                break
            if seg_len <= 0:
                break

            seg_data = _recv_exact(conn, seg_len)
            if len(seg_data) < seg_len:
                break

            if p is None:
                p = pyaudio.PyAudio()
            try:
                _play_wav_bytes(p, seg_data)
            except Exception as e:
                print(f"[solicitar_audio] erro: {e}")
            else:
                print("Segmento de áudio reproduzido.")
    except Exception as e:
        print(f"Erro durante a reprodução: {e}")
    finally:
        if p is not None:
            p.terminate()
