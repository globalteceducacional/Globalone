# -*- coding: utf-8 -*-
# Cliente TCP com suporte a STREAMING + TTS ao final

import os
import re
import json
import socket
import base64
from typing import Tuple, Optional

# Opcional: leitor de áudio já existente no seu projeto
try:
    import recv_audio
except Exception:
    recv_audio = None  # evita quebrar caso não exista

HOST = os.getenv("TECA_HOST", "192.168.18.102")
PORT = int(os.getenv("TECA_PORT", "6000"))

# ──────────────────────────────────────────────────────────────────────────────
# Protocolo: servidor envia mensagens com cabeçalho de 10 dígitos (len em bytes)
# + payload UTF-8. Marcadores especiais controlam o streaming:
#   <<STREAM_START>>, <<STREAM_END>>, <<FINAL>>\n<texto-final>
# ──────────────────────────────────────────────────────────────────────────────

def _recv_exact(conn: socket.socket, n: int) -> bytes:
    buf = bytearray()
    while len(buf) < n:
        chunk = conn.recv(n - len(buf))
        if not chunk:
            break
        buf.extend(chunk)
    return bytes(buf)

def _recv_packet(conn: socket.socket) -> Optional[str]:
    """Lê 1 pacote (10 bytes de header + payload) e retorna str (ou None)."""
    header = _recv_exact(conn, 10)
    if not header:
        return None
    try:
        size = int(header.decode("utf-8"))
    except Exception:
        # fallback: pode vir texto "solto"
        return header.decode("utf-8", errors="ignore")
    if size <= 0:
        return ""
    payload = _recv_exact(conn, size)
    return payload.decode("utf-8", errors="ignore")


def _recv_packet_bytes(conn: socket.socket) -> Optional[bytes]:
    """Lê 1 pacote e retorna bytes crus (sem decode). Usado p/ payload de áudio."""
    header = _recv_exact(conn, 10)
    if not header:
        return None
    try:
        size = int(header.decode("ascii"))
    except ValueError:
        return header
    if size <= 0:
        return b""
    return _recv_exact(conn, size)

def enviar_stream(
    conn: socket.socket,
    func: str,
    question: str,
    *,
    extra: dict | None = None,
    stream: bool = True,
    audio_player=None,
) -> Tuple[str, bool]:
    """
    Envia o JSON inicial, recebe o stream e retorna (final, dup_final),
    onde 'dup_final=True' indica que o FINAL já foi exibido via chunks.

    Quando o marker <<AUDIO>> aparece no stream, o próximo pacote é um WAV cru;
    se 'audio_player' for fornecido (objeto com .play(bytes)), é entregue lá.
    """
    payload = {
        "ID": "cliente",
        "funcao": func,
        "parametro": question,
        "stream": bool(stream),
    }
    if extra:
        payload.update(extra)

    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    conn.sendall(data)

    final_from_marker: Optional[str] = None
    printed_final_once = False

    while True:
        msg = _recv_packet(conn)
        if msg is None:
            break
        if msg == "<<STREAM_START>>":
            print("\n[stream] início\n")
            continue
        if msg == "<<STREAM_END>>":
            print("\n\n[stream] fim\n")
            if final_from_marker is not None:
                break
            continue
        if msg == "<<AUDIO>>":
            wav = _recv_packet_bytes(conn)
            if wav and audio_player is not None:
                audio_player.play(wav)
            continue
        if msg.startswith("<<FINAL>>"):
            final_from_marker = re.sub(r"^<<FINAL>>\s*", "", msg, flags=re.S)
            return (final_from_marker, printed_final_once)

        # chunk de stream
        if msg:
            print(msg, end="", flush=True)
            printed_final_once = True

    return (final_from_marker or "", printed_final_once)

def comando_upload(path: str) -> None:
    if not os.path.isfile(path):
        print(f"[upload] Arquivo não encontrado: {path}")
        return
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    payload = {
        "ID": "cliente",
        "funcao": "upload",
        "parametro": {"filename": os.path.basename(path), "filedata": b64},
        "stream": False,
    }
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as conn:
        conn.connect((HOST, PORT))
        conn.sendall(json.dumps(payload).encode("utf-8"))
        resp = _recv_packet(conn) or ""
        print(resp)

def comando_responda(question: str, voice: str = "Teca_v2") -> None:
    player = recv_audio.AudioQueuePlayer() if recv_audio else None
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as conn:
            conn.connect((HOST, PORT))
            final, dup = enviar_stream(
                conn, "responda", question,
                extra={"voice": voice},
                audio_player=player,
            )
            if final and not dup:
                print("\n———\nTexto final:\n" + final)
            # drena o sentinel "0000000000" (fim de áudio) se ainda estiver na fila
            try:
                _recv_packet_bytes(conn)
            except Exception:
                pass
    finally:
        if player:
            player.close()

def comando_explicativo(question: str) -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as conn:
        conn.connect((HOST, PORT))
        final, dup = enviar_stream(conn, "responda_explicativo", question)
        if final and not dup:
            print("\n———\nVersão final:\n" + final)

def comando_matematica(question: str) -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as conn:
        conn.connect((HOST, PORT))
        final, dup = enviar_stream(conn, "responda_matematica", question)
        if final and not dup:
            print("\n———\nResposta final:\n" + final)

# ==== CLI ======================================================================
if __name__ == "__main__":
    print("=== Cliente Teca (Streaming habilitado) ===")
    modo = ""
    while modo not in ("1", "2", "3"):
        modo = input(
            "Selecione o modo:\n"
            " [1] Conversação c/ TTS (stream)\n"
            " [2] Explicativo s/ TTS (stream)\n"
            " [3] Matemática (stream)\n"
            "Opção: "
        ).strip()
    print(f"Modo selecionado: {'Conversação c/ TTS' if modo=='1' else 'Explicativo s/ TTS' if modo=='2' else 'Matemática'}\n")

    while True:
        line = input("Você: ").strip()
        if not line:
            continue
        if line.lower() in ("sair", "exit"):
            break
        if line.startswith("upload "):
            _, p = line.split(" ", 1)
            comando_upload(p)
        else:
            if modo == "1":
                comando_responda(line)
            elif modo == "2":
                comando_explicativo(line)
            else:
                comando_matematica(line)
