import crypto from 'crypto';

import asyncHandler from '../middlewares/asyncHandler.middleware.js';
import User from '../models/user.model.js';
import AppError from '../utils/AppErrors.js';
import { razorpay } from '../server.js';
import Payment from '../models/Payment.model.js';

/**
 * @ACTIVATE_SUBSCRIPTION
 * @ROUTE @POST {{URL}}/api/v1/payments/subscribe  
 * @ACCESS Private (Logged in user only)
 */
export const buySubscription = asyncHandler(async (req, res, next) => {

  try {
      // Extracting ID from request obj
  const { id } = req.user;

  // Finding the user based on the ID
  const user = await User.findById(id);

  if (!user) {
    return next(new AppError('Unauthorized, please login'));
  }

  // Checking the user role
  if (user.role === 'ADMIN') {
    return next(new AppError('Admin cannot purchase a subscription', 400));
  }

  // Creating a subscription using razorpay that we imported from the server
  const subscription = await razorpay.subscriptions.create({
    plan_id: process.env.RAZORPAY_PLAN_ID, // The unique plan ID
    customer_notify: 1, // 1 means razorpay will handle notifying the customer, 0 means we will not notify the customer
    total_count: 1, // 12 means it will charge every month for a 1-year sub.
  });

  // console.log( "this is hit",subscription);

  // Adding the ID and the status to the user account
  user.subscription.id = subscription.id;
  user.subscription.status = subscription.status;

  // Saving the user object
  await user.save();

  res.status(200).json({
    success: true,
    message: 'subscribed successfully',
    subscription_id: subscription.id,
  });
  } catch (error) {
    console.log("not find subscription" , error);
    
  }

});

/**
 * @VERIFY_SUBSCRIPTION
 * @ROUTE @POST {{URL}}/api/v1/payments/verify
 * @ACCESS Private (Logged in user only)
 */
export const verifySubscription = asyncHandler(async (req, res, next) => {
  const { id } = req.user;
  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;


  // Finding the user
  const user = await User.findById(id);

  if (!user) {
    return next(new AppError('Unauthorized, please login'));
  }

  // Getting the subscription ID from the user object
  const subscriptionId = user.subscription.id;

  // Generating a signature with SHA256 for verification purposes
  // Here the subscriptionId should be the one which we saved in the DB
  // razorpay_payment_id is from the frontend and there should be a '|' character between this and subscriptionId
  // At the end convert it to Hex value
  const generatedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_SECRET)
    .update(`${razorpay_payment_id}|${subscriptionId}`)
    .digest('hex');

  // Check if generated signature and signature received from the frontend is the same or not
  if (generatedSignature !== razorpay_signature) {
    return next(new AppError('Payment not verified, please try again.', 400));
  }

  // If they match create payment and store it in the DB
  await Payment.create({
    razorpay_payment_id,
    razorpay_subscription_id,
    razorpay_signature,
  });

  // Update the user subscription status to active (This will be created before this)
  user.subscription.status = 'active';
  
  // Save the user in the DB with any changes
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Payment verified successfully',
  });
});

/**
 * @CANCEL_SUBSCRIPTION
 * @ROUTE @POST {{URL}}/api/v1/payments/unsubscribe
 * @ACCESS Private (Logged in user only)
 */
export const cancelSubscription = asyncHandler(async (req, res, next) => {
  const { id } = req.user;

  // Finding the user
  const user = await User.findById(id);
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  console.log("User fetched: ", user);

  // Checking the user role
  if (user.role === 'ADMIN') {
    return next(new AppError('Admin cannot cancel subscription', 400));
  }

  

  // Finding subscription ID from user
  const subscriptionId = user.subscription?.id; // Optional chaining to handle cases where user.subscription is undefined

   user.subscription.status = subscriptionId.status
  if (!subscriptionId) {
    return next(new AppError('No subscription found for this user', 404));
  }
  console.log("Subscription ID: ", subscriptionId);

  try {
    // Fetch the subscription details from Razorpay
    const subscription = await razorpay.subscriptions.fetch(subscriptionId);
    console.log(subscription , "frp raz");
   
    if (!subscription) {
      return next(new AppError('Subscription not found in Razorpay', 404));
    }
    console.log("Fetched subscription status from Razorpay: ", subscription.status);

    // Update the local subscription status only if it is different
    if (user.subscription.status !== subscription.status) {
      user.subscription.status = subscription.status;
      await user.save();
      console.log("Updated local subscription status: ", user.subscription.status);
    }

    // Check if the subscription is in a cancellable status
    if (subscription.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Subscription is already completed and cannot be cancelled.',
      });
    }

    // Cancel the subscription using Razorpay
    const canceledSubscription = await razorpay.subscriptions.cancel(subscriptionId);
    if (!canceledSubscription) {
      return next(new AppError('Failed to cancel subscription with Razorpay', 500));
    }
    console.log("Canceled subscription status from Razorpay: ", canceledSubscription.status);

    // Update the subscription status on the user account
    user.subscription.status = canceledSubscription.status;
    await user.save();
    console.log("Updated user subscription status after cancellation: ", user.subscription.status);

    // Send the response
    res.status(200).json({
      success: true,
      message: 'Subscription canceled successfully',
    });

  } catch (error) {
    // Handling Razorpay errors
    console.error("Error from Razorpay: ", error);
    const message = error.error?.description || 'An error occurred while canceling the subscription';
    const statusCode = error.statusCode || 500;
    return next(new AppError(message, statusCode));
  }
});


/**
 * @GET_RAZORPAY_ID
 * @ROUTE @POST {{URL}}/api/v1/payments/razorpay-key
 * @ACCESS Public
 */
export const getRazorpayApiKey = asyncHandler(async (_req, res, _next) => {
  res.status(200).json({
    success: true,
    message: 'Razorpay API key',
    key: process.env.RAZORPAY_KEY_ID,
  });
});

/**
 * @GET_RAZORPAY_ID
 * @ROUTE @GET {{URL}}/api/v1/payments
 * @ACCESS Private (ADMIN only)
 */
export const allPayments = asyncHandler(async (req, res, _next) => {
  const { count, skip } = req.query;

  // Find all subscriptions from razorpay
  const allPayments = await razorpay.subscriptions.all({
    count: count ? count : 10, // If count is sent then use that else default to 10
    skip: skip ? skip : 0, // // If skip is sent then use that else default to 0
  });

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const finalMonths = {
    January: 0,
    February: 0,
    March: 0,
    April: 0,
    May: 0,
    June: 0,
    July: 0,
    August: 0,
    September: 0,
    October: 0,
    November: 0,
    December: 0,
  };

  const monthlyWisePayments = allPayments.items.map((payment) => {
    // We are using payment.start_at which is in unix time, so we are converting it to Human readable format using Date()
    const monthsInNumbers = new Date(payment.start_at * 1000);

    return monthNames[monthsInNumbers.getMonth()];
  });

  monthlyWisePayments.map((month) => {
    Object.keys(finalMonths).forEach((objMonth) => {
      if (month === objMonth) {
        finalMonths[month] += 1;
      }
    });
  });

  const monthlySalesRecord = [];

  Object.keys(finalMonths).forEach((monthName) => {
    monthlySalesRecord.push(finalMonths[monthName]);
  });

  res.status(200).json({
    success: true,
    message: 'All payments',
    allPayments,
    finalMonths,
    monthlySalesRecord,
  });
});
