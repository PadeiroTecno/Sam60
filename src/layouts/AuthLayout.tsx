import React from 'react';
import { Outlet } from 'react-router-dom';

const AuthLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Left side with brand and logo */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary-600 flex-col justify-center items-center p-12 text-white">
        <img 
          src="/logo.png" 
          alt="Logo" 
          className="h-32 mb-8" // <-- Tamanho aumentado aqui
        />
        <p className="text-xl mb-8 text-center">
          Gerencie seus streams e conteúdo on-demand com facilidade e eficiência
        </p>
      </div>

      {/* Right side with auth forms */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="bg-white p-8 rounded-lg shadow-md">
            <div className="flex justify-center mb-6 lg:hidden">
              {/* Ícone visível apenas no mobile */}
              {/* Você pode remover esse ícone também, se quiser */}
              {/* <FileVideo size={60} className="text-primary-600" /> */}
            </div>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
