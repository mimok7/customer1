import React from 'react';

interface PageWrapperProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
}

export default function PageWrapper({ children, title, description, actions }: PageWrapperProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {(title || description || actions) && (
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              {title && <h1 className="text-xl font-bold text-gray-900">{title}</h1>}
              {description && <p className="mt-2 text-sm text-gray-600">{description}</p>}
            </div>
            {actions && (
              <div className="flex items-center gap-2 self-end md:self-auto">
                {actions}
              </div>
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
