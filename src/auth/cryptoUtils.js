import { useState } from 'react';

// Generar salt aleatorio
export const generateSalt = () => {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

// Derivar clave de cifrado
export const deriveKey = async (password, salt) => {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    {name: 'PBKDF2'},
    false,
    ['deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    {name: 'AES-GCM', length: 256},
    false,
    ['encrypt', 'decrypt']
  );
};

// Cifrar datos
export const encryptData = async (data, password) => {
  const salt = generateSalt();
  const key = await deriveKey(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv},
    key,
    new TextEncoder().encode(data)
  );
  
  return {
    salt,
    iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
    data: Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('')
  };
};

// Descifrar datos
export const decryptData = async (encrypted, password) => {
  const key = await deriveKey(password, encrypted.salt);
  const iv = new Uint8Array(encrypted.iv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  
  const decrypted = await crypto.subtle.decrypt(
    {name: 'AES-GCM', iv},
    key,
    new Uint8Array(encrypted.data.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))
  );
  
  return new TextDecoder().decode(decrypted);
};
