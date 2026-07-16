<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class OfficeTest extends TestCase
{
    use RefreshDatabase;

    public function test_guests_are_redirected_to_the_login_page(): void
    {
        $this->get('/office')->assertRedirect('/login');
    }

    public function test_authenticated_users_can_visit_the_office(): void
    {
        $this->actingAs(User::factory()->create());

        $this->get('/office')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('office'));
    }
}
