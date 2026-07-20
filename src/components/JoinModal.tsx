import { useEffect, useState } from "react";
import { fetchNet, fetchQr } from "../api";

interface Props {
  code: string;
  onClose: () => void;
}

// Shows the join code + a QR pointing at the host's LAN address so phones
// on the same WiFi can join by scanning.
export function JoinModal({ code, onClose }: Props) {
  const [urls, setUrls] = useState<string[]>([]);
  const [qr, setQr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    fetchNet().then(({ ips, port }) => {
      const list = ips.map((ip) => `http://${ip}:${port}/?code=${code}`);
      // Fall back to whatever host the browser is already on.
      if (!list.length) list.push(`${location.origin}/?code=${code}`);
      setUrls(list);
      setSelected(list[0]);
    });
  }, [code]);

  useEffect(() => {
    if (selected) fetchQr(selected).then(setQr).catch(() => setQr(null));
  }, [selected]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal join-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>Players join here</h3>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="join-code">
          <span className="muted small">Game code</span>
          <div className="big-code">{code}</div>
        </div>

        {qr && <img className="qr" src={qr} alt="Join QR code" />}

        <p className="muted small">Scan on the same WiFi, or open:</p>
        {urls.length > 1 && (
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {urls.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        )}
        {urls.length === 1 && <code className="url">{urls[0]}</code>}
        <p className="muted small">
          Or players go to the site and enter code <b>{code}</b>.
        </p>
      </div>
    </div>
  );
}
