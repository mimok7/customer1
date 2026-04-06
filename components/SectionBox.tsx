'use client';

import React from 'react';

export default function SectionBox({
  title,
  icon,
  children,
}: {
  title?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm mb-6">
      {(title || icon) && (
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          {icon}
          {title}
        </h3>
      )}
      <div className="space-y-4">{children}</div>
    </div>
  );
}
