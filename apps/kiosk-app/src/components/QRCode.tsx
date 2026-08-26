import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface QRCodeProps {
  /** The URL the customer's phone should open. */
  value: string;
  size?: number;
  /** Optional caption rendered under the code. */
  caption?: string;
  className?: string;
}

/**
 * The virtual waiting room's entry point.
 *
 * Scanning the code opens a live tracker for the ticket on the customer's own
 * phone, so they can leave the waiting area instead of sitting in it.
 *
 * Rendered as SVG so it stays sharp on a wall-mounted kiosk and prints cleanly.
 */
export const QRCode: React.FC<QRCodeProps> = ({ value, size = 148, caption, className }) => (
  <div className={`flex flex-col items-center ${className || ''}`}>
    <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-sm">
      <QRCodeSVG
        value={value}
        size={size}
        level="M"
        marginSize={0}
        bgColor="#ffffff"
        fgColor="#111827"
      />
    </div>
    {caption && (
      <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">
        {caption}
      </p>
    )}
  </div>
);

export default QRCode;
