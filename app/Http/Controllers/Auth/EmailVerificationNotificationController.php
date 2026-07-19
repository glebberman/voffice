<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Support\CurrentUser;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class EmailVerificationNotificationController extends Controller
{
    /**
     * Send a new email verification notification.
     */
    public function store(Request $request): RedirectResponse
    {
        if (CurrentUser::of($request)->hasVerifiedEmail()) {
            return redirect()->intended(route('dashboard', absolute: false));
        }

        CurrentUser::of($request)->sendEmailVerificationNotification();

        return back()->with('status', 'verification-link-sent');
    }
}
