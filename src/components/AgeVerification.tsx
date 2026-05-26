'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from './ToastProvider';

function getValidAge(dob: string) {
  const birthday = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birthday.getTime())) return null;

  const today = new Date();
  if (birthday > today) return null;

  let age = today.getFullYear() - birthday.getFullYear();
  const monthOffset = today.getMonth() - birthday.getMonth();
  if (monthOffset < 0 || (monthOffset === 0 && today.getDate() < birthday.getDate())) age -= 1;

  if (age < 1 || age > 120) return null;
  return age;
}

export default function AgeVerification() {
  const { user, profile, refreshProfile } = useAuth();
  const [dob, setDob] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [error, setError] = useState('');
  const supabase = createClient();
  const { showToast } = useToast();

  if (!user || !profile || profile.age !== null) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const age = getValidAge(dob);

    if (age === null) {
      setError('Enter a valid date of birth.');
      return;
    }
    
    if (age < 13 && !parentEmail) {
      setError('Parent email is required for users under 13.');
      return;
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ age, date_of_birth: dob, parent_email: age < 13 ? parentEmail : null })
      .eq('id', user.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      await refreshProfile();
      showToast({ title: 'Profile updated', variant: 'success' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="surface-card w-full max-w-md p-8 shadow-2xl">
        <h2 className="text-2xl font-bold mb-6 text-primary text-center">One last thing...</h2>
        <p className="text-muted mb-6 text-center">To comply with COPPA, we need to verify your age.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-primary mb-1">Date of birth</label>
            <input
              type="date"
              required
              className="form-input w-full px-4 py-2"
              value={dob}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDob(e.target.value)}
            />
          </div>
          {dob && getValidAge(dob) !== null && getValidAge(dob)! < 13 && (
            <div>
              <label className="block text-sm font-medium text-primary mb-1">Parent email address</label>
              <input
                type="email"
                required
                className="form-input w-full px-4 py-2"
                placeholder="parent@example.com"
                value={parentEmail}
                onChange={(e) => setParentEmail(e.target.value)}
              />
              <p className="mt-2 text-xs text-muted">Users under 13 need parent approval before chatting.</p>
            </div>
          )}
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            className="ui-button primary w-full py-3"
          >
            Complete Registration
          </button>
        </form>
      </div>
    </div>
  );
}
