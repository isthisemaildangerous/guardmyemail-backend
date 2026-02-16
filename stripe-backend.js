/**
 * Backend API for Stripe Payment Integration
 * Node.js/Express example
 */

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app = express();

app.use(express.json());

/**
 * Create Stripe Checkout Session
 * Called when user clicks "Upgrade" button
 */
app.post('/create-checkout-session', async (req, res) => {
  const { priceId, customerEmail, mode } = req.body;
  
  try {
    const session = await stripe.checkout.sessions.create({
      mode: mode || 'subscription', // 'subscription' or 'payment'
      payment_method