
"use client"
import { zodResolver } from "@hookform/resolvers/zod";
import React from "react";
import { FieldValues, useForm } from "react-hook-form";
import { z } from "zod";

const LoginPage = () => {
  const schema = z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(6, "Password must be at least 6 characters long"),
  });


    const {
      register,
      handleSubmit,
      formState: { errors },
    } = useForm({
      resolver: zodResolver(schema),
    });

    const onSubmit = async (data: FieldValues) => {
      const { username, password } = data;

      try {
        const response = await fetch("http://localhost:8080/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username, password }),
        });


        console.log(response, "----> response")

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
          <div>
            <input
              type="text"
              placeholder="Username"
              {...register("username")}
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              {...register("password")}
            />
          </div>
          <button type="submit">Register</button>
        </form>
      </div>
    );
  };



export default LoginPage;
