"use client"
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const schema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

type FormData = z.infer<typeof schema>;

const SignupPage = () => {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    const { username, password } = data;

    try {
      const response = await fetch('http://localhost:8080/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      }); 

      console.log(response)

      if (response.ok) {
        const data = await response.json(); // Parse as JSON on success
        console.log("Registration successful:", data);
      } 
    } catch (error) {
      console.error("Error during registration:", error);
    }
  };

  return (
    <div>
      <h2>Register</h2>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div >
          <input type="text" placeholder="Username" {...register('username')}  />
          {errors.username && <p>{errors.username.message}</p>}
        </div>
        <div >
          <input type="password" placeholder="Password" {...register('password')}  />
          {errors.password && <p >{errors.password.message}</p>}
        </div>
        <button type="submit" >Register</button>
      </form>
    </div>
  );
};



export default SignupPage;